// Package notify sends problems where people will see them, starting with Telegram.
package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Telegram is the Bot API: a bot the owner made with @BotFather, writing to the chat that sent it /start.
type Telegram struct {
	Base string // https://api.telegram.org; tests use a local server
	HTTP *http.Client
}

func NewTelegram() *Telegram {
	return &Telegram{Base: "https://api.telegram.org", HTTP: &http.Client{Timeout: 40 * time.Second}}
}

// ErrToken: Telegram did not accept the bot token.
var ErrToken = errors.New("telegram: the bot token is not valid")

type tgReply struct {
	OK          bool            `json:"ok"`
	Result      json.RawMessage `json:"result"`
	Description string          `json:"description"`
	ErrorCode   int             `json:"error_code"`
}

func (t *Telegram) call(ctx context.Context, token, method string, body any, out any) error {
	b, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, t.Base+"/bot"+token+"/"+method, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := t.HTTP.Do(req)
	if err != nil {
		// The URL holds the token: never let it reach a log or the interface.
		return errors.New("telegram: " + strings.ReplaceAll(err.Error(), token, "…"))
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	var r tgReply
	if err := json.Unmarshal(data, &r); err != nil {
		return fmt.Errorf("telegram: HTTP %d", res.StatusCode)
	}
	if !r.OK {
		if r.ErrorCode == http.StatusUnauthorized || r.ErrorCode == http.StatusNotFound {
			return ErrToken
		}
		return fmt.Errorf("telegram: %s", r.Description)
	}
	if out != nil {
		return json.Unmarshal(r.Result, out)
	}
	return nil
}

// Me returns the bot's @username, checking the token on the way.
func (t *Telegram) Me(ctx context.Context, token string) (string, error) {
	var me struct {
		Username string `json:"username"`
	}
	if err := t.call(ctx, token, "getMe", struct{}{}, &me); err != nil {
		return "", err
	}
	return me.Username, nil
}

// Chat is where messages go.
type Chat struct {
	ID   int64
	Name string
}

// WaitChat waits for someone to write to the bot (/start) and returns that chat.
func (t *Telegram) WaitChat(ctx context.Context, token string) (Chat, error) {
	offset := 0
	for {
		var ups []struct {
			UpdateID int `json:"update_id"`
			Message  *struct {
				Chat struct {
					ID        int64  `json:"id"`
					Type      string `json:"type"`
					Title     string `json:"title"`
					Username  string `json:"username"`
					FirstName string `json:"first_name"`
					LastName  string `json:"last_name"`
				} `json:"chat"`
			} `json:"message"`
		}
		err := t.call(ctx, token, "getUpdates", map[string]any{"offset": offset, "timeout": 25, "allowed_updates": []string{"message"}}, &ups)
		if err != nil {
			if ctx.Err() != nil {
				return Chat{}, ctx.Err()
			}
			return Chat{}, err
		}
		for _, u := range ups {
			offset = u.UpdateID + 1
			if u.Message == nil {
				continue
			}
			c := u.Message.Chat
			name := c.Title
			if name == "" {
				name = strings.TrimSpace(c.FirstName + " " + c.LastName)
			}
			if name == "" && c.Username != "" {
				name = "@" + c.Username
			}
			// Mark it read, so the next connection does not pick up an old message.
			_ = t.call(ctx, token, "getUpdates", map[string]any{"offset": offset, "timeout": 0}, nil)
			return Chat{ID: c.ID, Name: name}, nil
		}
		if ctx.Err() != nil {
			return Chat{}, ctx.Err()
		}
	}
}

// Send writes plain text to a chat (no markup: nothing in a message can break it).
func (t *Telegram) Send(ctx context.Context, token string, chat int64, text string) error {
	return t.call(ctx, token, "sendMessage", map[string]any{"chat_id": chat, "text": text, "disable_web_page_preview": true}, nil)
}
