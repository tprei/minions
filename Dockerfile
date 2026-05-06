FROM node:lts-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    tmux \
    git \
    ca-certificates \
    curl \
    openssh-client \
    jq \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g \
    @anthropic-ai/claude-code@2.1.131 \
    @openai/codex@0.128.0

RUN groupadd -g 1001 minions && useradd -u 1001 -g 1001 -m -d /home/minions minions

RUN mkdir -p /workspace /sessions /cache \
  && chown -R 1001:1001 /home/minions /workspace /sessions /cache

USER minions
WORKDIR /workspace

CMD ["sh", "-c", "tail -f /dev/null"]
