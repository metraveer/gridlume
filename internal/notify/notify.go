package notify

import (
	"context"
	"errors"
	"log/slog"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/metraveer/gridlume/internal/i18n"
	"github.com/metraveer/gridlume/internal/store"
)

// Setting keys. The token is a secret: it is never sent back to the interface.
const (
	keyToken     = "notify_tg_token"
	keyBot       = "notify_tg_bot"
	keyChat      = "notify_tg_chat"
	keyChatName  = "notify_tg_chat_name"
	keyWarn      = "notify_warn"     // "1": amber problems too, not only red
	keyResolved  = "notify_resolved" // "1": say when a problem is over
	keyQuiet     = "notify_quiet"    // "1": quiet hours on
	keyQuietFrom = "notify_quiet_from"
	keyQuietTo   = "notify_quiet_to"
	keyLang      = "notify_lang"
)

// Rules decide what is sent.
type Rules struct {
	Warn      bool   `json:"warn"`
	Resolved  bool   `json:"resolved"`
	Quiet     bool   `json:"quiet"` // in quiet hours only red problems are sent
	QuietFrom string `json:"quietFrom"`
	QuietTo   string `json:"quietTo"`
	Lang      string `json:"lang"`
}

// Status is what the interface shows about the channel.
type Status struct {
	Connected bool   `json:"connected"`
	Bot       string `json:"bot,omitempty"`
	ChatName  string `json:"chatName,omitempty"`
	Waiting   bool   `json:"waiting"` // waiting for /start
	LastSent  int64  `json:"lastSent,omitempty"`
	LastError string `json:"lastError,omitempty"`
}

// Notifier sends problems to Telegram, retrying a while when it cannot.
type Notifier struct {
	Store *store.Store
	TG    *Telegram
	Log   *slog.Logger
	Now   func() time.Time
	// Retry is how long to wait before each new attempt at a message that could not be sent.
	Retry []time.Duration

	mu      sync.Mutex
	waiting context.CancelFunc
	status  Status
	queue   chan string
}

func New(s *store.Store, log *slog.Logger) *Notifier {
	return &Notifier{Store: s, TG: NewTelegram(), Log: log, Now: time.Now,
		Retry: []time.Duration{10 * time.Second, 30 * time.Second, time.Minute, 2 * time.Minute, 5 * time.Minute},
		queue: make(chan string, 100)}
}

func (n *Notifier) get(ctx context.Context, key, def string) string {
	v, _ := n.Store.Setting(ctx, key, def)
	return v
}

// GetRules returns the rules; amber problems and "resolved" are on by default, quiet hours 23:00–08:00 off.
func (n *Notifier) GetRules(ctx context.Context) Rules {
	return Rules{
		Warn: n.get(ctx, keyWarn, "1") == "1", Resolved: n.get(ctx, keyResolved, "1") == "1", Quiet: n.get(ctx, keyQuiet, "0") == "1",
		QuietFrom: n.get(ctx, keyQuietFrom, "23:00"), QuietTo: n.get(ctx, keyQuietTo, "08:00"), Lang: n.get(ctx, keyLang, "ru"),
	}
}

// ErrRules: a time is not HH:MM or the language is unknown.
var ErrRules = errors.New("notify: invalid rules")

func (n *Notifier) SaveRules(ctx context.Context, r Rules) error {
	if _, ok := minutes(r.QuietFrom); !ok {
		return ErrRules
	}
	if _, ok := minutes(r.QuietTo); !ok {
		return ErrRules
	}
	if r.Lang != "ru" && r.Lang != "en" {
		return ErrRules
	}
	for k, v := range map[string]string{keyWarn: bit(r.Warn), keyResolved: bit(r.Resolved), keyQuiet: bit(r.Quiet), keyQuietFrom: r.QuietFrom, keyQuietTo: r.QuietTo, keyLang: r.Lang} {
		if err := n.Store.SetSetting(ctx, k, v); err != nil {
			return err
		}
	}
	return nil
}

// Status of the Telegram channel.
func (n *Notifier) Status(ctx context.Context) Status {
	n.mu.Lock()
	st := n.status
	st.Waiting = n.waiting != nil
	n.mu.Unlock()
	st.Bot = n.get(ctx, keyBot, "")
	st.ChatName = n.get(ctx, keyChatName, "")
	st.Connected = n.get(ctx, keyToken, "") != "" && n.get(ctx, keyChat, "") != ""
	return st
}

// Connect checks the token, keeps it, and waits (up to WaitFor) for the owner to write /start to the bot.
func (n *Notifier) Connect(ctx context.Context, token string) error {
	token = strings.TrimSpace(token)
	bot, err := n.TG.Me(ctx, token)
	if err != nil {
		return err
	}
	for k, v := range map[string]string{keyToken: token, keyBot: bot, keyChat: "", keyChatName: ""} {
		if err := n.Store.SetSetting(ctx, k, v); err != nil {
			return err
		}
	}
	n.mu.Lock()
	if n.waiting != nil {
		n.waiting()
	}
	wctx, cancel := context.WithTimeout(context.Background(), WaitFor)
	n.waiting = cancel
	n.status.LastError = ""
	n.mu.Unlock()
	go n.wait(wctx, cancel, token)
	return nil
}

// WaitFor is how long Connect waits for /start.
var WaitFor = 10 * time.Minute

func (n *Notifier) wait(ctx context.Context, cancel context.CancelFunc, token string) {
	defer func() {
		cancel()
		n.mu.Lock()
		n.waiting = nil
		n.mu.Unlock()
	}()
	chat, err := n.TG.WaitChat(ctx, token)
	if err != nil {
		if !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
			n.fail(err)
		}
		return
	}
	bg := context.Background()
	_ = n.Store.SetSetting(bg, keyChat, strconv.FormatInt(chat.ID, 10))
	_ = n.Store.SetSetting(bg, keyChatName, chat.Name)
	n.Log.Info("telegram connected", "chat", chat.Name)
	lang := n.GetRules(bg).Lang
	if err := n.TG.Send(bg, token, chat.ID, i18n.T(lang, "notify.hello", nil)); err != nil {
		n.fail(err)
		return
	}
	n.sent()
}

// Disconnect forgets the bot and the chat.
func (n *Notifier) Disconnect(ctx context.Context) error {
	n.mu.Lock()
	if n.waiting != nil {
		n.waiting()
	}
	n.status = Status{}
	n.mu.Unlock()
	for _, k := range []string{keyToken, keyBot, keyChat, keyChatName} {
		if err := n.Store.SetSetting(ctx, k, ""); err != nil {
			return err
		}
	}
	return nil
}

// ErrNotConnected: there is no bot or no chat yet.
var ErrNotConnected = errors.New("notify: telegram is not connected")

// Test sends a message at once and says whether it went.
func (n *Notifier) Test(ctx context.Context) error {
	token, chat, ok := n.target(ctx)
	if !ok {
		return ErrNotConnected
	}
	if err := n.TG.Send(ctx, token, chat, i18n.T(n.GetRules(ctx).Lang, "notify.test", nil)); err != nil {
		n.fail(err)
		return err
	}
	n.sent()
	return nil
}

func (n *Notifier) target(ctx context.Context) (string, int64, bool) {
	token := n.get(ctx, keyToken, "")
	chat, err := strconv.ParseInt(n.get(ctx, keyChat, ""), 10, 64)
	return token, chat, token != "" && err == nil && chat != 0
}

func (n *Notifier) fail(err error) {
	n.mu.Lock()
	n.status.LastError = err.Error()
	n.mu.Unlock()
	n.Log.Warn("telegram", "err", err)
}

func (n *Notifier) sent() {
	n.mu.Lock()
	n.status.LastError = ""
	n.status.LastSent = n.Now().UnixMilli()
	n.mu.Unlock()
}

// Enqueue puts a message in line; it is dropped when the line is full (something is very wrong anyway).
func (n *Notifier) Enqueue(text string) {
	select {
	case n.queue <- text:
	default:
		n.Log.Warn("telegram: queue full, message dropped")
	}
}

// Run sends queued messages until ctx ends, retrying each a few times over about ten minutes.
func (n *Notifier) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case text := <-n.queue:
			for attempt := 0; ; attempt++ {
				token, chat, ok := n.target(ctx)
				if !ok {
					break // not connected: nobody to tell
				}
				err := n.TG.Send(ctx, token, chat, text)
				if err == nil {
					n.sent()
					break
				}
				n.fail(err)
				if errors.Is(err, ErrToken) || attempt >= len(n.Retry) {
					break
				}
				select {
				case <-ctx.Done():
					return
				case <-time.After(n.Retry[attempt]):
				}
			}
		}
	}
}

// quietNow: the time of day is inside the quiet hours (which may cross midnight).
func (r Rules) quietNow(now time.Time) bool {
	if !r.Quiet {
		return false
	}
	from, ok1 := minutes(r.QuietFrom)
	to, ok2 := minutes(r.QuietTo)
	if !ok1 || !ok2 || from == to {
		return false
	}
	m := now.Hour()*60 + now.Minute()
	if from < to {
		return m >= from && m < to
	}
	return m >= from || m < to
}

func minutes(hhmm string) (int, bool) {
	h, m, ok := strings.Cut(hhmm, ":")
	if !ok {
		return 0, false
	}
	hh, err1 := strconv.Atoi(h)
	mm, err2 := strconv.Atoi(m)
	if err1 != nil || err2 != nil || hh < 0 || hh > 23 || mm < 0 || mm > 59 || len(h) != 2 || len(m) != 2 {
		return 0, false
	}
	return hh*60 + mm, true
}

func bit(b bool) string {
	if b {
		return "1"
	}
	return "0"
}

// duration says how long something lasted, with the interface's units.
func duration(lang string, d time.Duration) string {
	m := int(d.Minutes())
	switch {
	case m < 1:
		return i18n.T(lang, "unit.uptime.m", map[string]any{"m": 1})
	case m < 60:
		return i18n.T(lang, "unit.uptime.m", map[string]any{"m": m})
	case m < 24*60:
		return i18n.T(lang, "unit.uptime.hm", map[string]any{"h": m / 60, "m": m % 60})
	default:
		return i18n.T(lang, "unit.uptime.dh", map[string]any{"d": m / (24 * 60), "h": m % (24 * 60) / 60})
	}
}
