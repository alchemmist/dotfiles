PRECOMMIT_SCRIPT := scripts/backup-packages.sh
HOOK_PATH := .git/hooks/pre-commit

.PHONY: install-precommit uninstall-precommit precommit fingerprint-install fingerprint-uninstall

install-precommit:
	@mkdir -p .git/hooks
	@printf '#!/bin/sh\nset -e\n%s\n%s\n' \
		"$(PRECOMMIT_SCRIPT)" \
		"git add packages/pacman.txt packages/yay.txt 2>/dev/null || true" \
		> $(HOOK_PATH)
	@chmod +x $(HOOK_PATH)
	@echo "pre-commit hook installed"

uninstall-precommit:
	@rm -f $(HOOK_PATH)
	@echo "pre-commit hook removed"

precommit:
	@$(PRECOMMIT_SCRIPT)

fingerprint-install:
	@./fingerprint/install.sh

fingerprint-uninstall:
	@./fingerprint/uninstall.sh
