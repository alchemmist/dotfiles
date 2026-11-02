# Pi installation compatibility

Upstream: https://github.com/ndraiman/pi-cursor-provider
Commit: 82fc4e73f9ae820d87b34ac36713b18989910a36 (0.1.11).

Local changes for @earendil-works Pi 1.4:
- Type imports use @earendil-works instead of @mariozechner.
- Register effort maps as model.thinkingLevelMap (current Pi API).
- Advertise reasoning only for discovered effort variants.
- Discover models on session_start with stored OAuth, not only login/refresh.

No credentials are stored here. Run /login cursor to authenticate.
- Answer current Cursor MCP-state discovery (ExecServerMessage/ExecClientMessage field 36); without this, tool calls hang. Wire layout verified against locally installed Cursor CLI 2026.10.19.
- Surface structured upstream billing errors as SSE errors, preserving their actual explanation.

Live verification after OAuth: discovery returned 78 models; grok-4.7 answered at low/high/off and called Pi read with a verified fixture result, including the normal extension configuration with pi-subagents. GPT-5.6 Sol was rejected by Cursor billing (prepaid_balance_exhausted), not reasoning mapping.
