# ==========================================
# Stage 1: Build React 18 Frontend
# ==========================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ==========================================
# Stage 2: Build Go Standalone Binary
# ==========================================
FROM golang:1.22-alpine AS backend-builder
WORKDIR /app

# Install git and build essentials
RUN apk add --no-cache git

COPY go.mod go.sum ./
RUN go mod download

# Copy backend source code
COPY cmd/ cmd/
COPY internal/ internal/
COPY configs/ configs/

# Copy built frontend assets from stage 1 into Go embed directory
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
COPY frontend/embed.go /app/frontend/embed.go

# Compile 100% static Linux ELF binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /app/bin/lora ./cmd/lora

# ==========================================
# Stage 3: Minimal Production Container
# ==========================================
FROM alpine:3.20
WORKDIR /app

# Install ca-certificates, curl, bash, and standard tools
RUN apk add --no-cache ca-certificates curl bash tzdata

# Install kubectl for cluster connectivity
RUN curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
    && chmod +x kubectl \
    && mv kubectl /usr/local/bin/

# Copy compiled LORA binary
COPY --from=backend-builder /app/bin/lora /app/lora
COPY configs/lora-config.example.yaml /app/configs/lora-config.example.yaml

# Create directory structure for SQLite DB and managed kubeconfigs
RUN mkdir -p /app/data/kubeconfigs

# Environment and Ports
ENV LORA_SERVER_HOST=0.0.0.0
ENV LORA_SERVER_PORT=8080
EXPOSE 8080

# Persistent storage mount for SQLite database and kubeconfigs
VOLUME ["/app/data"]

ENTRYPOINT ["/app/lora"]

