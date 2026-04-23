# Spotify audio features API — Docker control
# Override defaults: make run HOST_PORT=9090 IMAGE_TAG=dev

IMAGE_NAME ?= spotify-audio-features-api
IMAGE_TAG ?= latest
CONTAINER_NAME ?= spotify-audio-features-api
HOST_PORT ?= 8080
DOCKERFILE ?= Dockerfile
CONTEXT ?= .

IMAGE := $(IMAGE_NAME):$(IMAGE_TAG)

# Extra args for docker run (e.g. DOCKER_RUN_EXTRA="--env-file .env -v hf-cache:/root/.cache/huggingface")
DOCKER_RUN_EXTRA ?=

# Forward HF_TOKEN from the host when set (dataset may require auth)
DOCKER_ENV := -e HF_TOKEN \
	-e LOOKUP_CACHE_SIZE \
	-e DISABLE_STAT_PRUNING \
	-e PREWARM_CONCURRENCY \
	-e PREWARM_SHARDS \
	-e PREWARM_KAGGLE \
	-e KAGGLE_DATASET \
	-e KAGGLE_GENRE_CSV \
	-e LOG_LEVEL

.DEFAULT_GOAL := help

.PHONY: help build build-nc run run-detached up start stop down rm restart logs logs-f shell ps clean rebuild

help:
	@echo "Spotify audio features API (Docker)"
	@echo ""
	@echo "  make build          Build image $(IMAGE)"
	@echo "  make build-nc       Build with --no-cache"
	@echo "  make run            Build (if needed) and run in foreground (--rm, -it)"
	@echo "  make run-detached   Build and run in background (--restart unless-stopped)"
	@echo "  make up / start     Alias for run-detached"
	@echo "  make stop           Stop container"
	@echo "  make rm             Stop and remove container"
	@echo "  make down           Alias for rm"
	@echo "  make restart        rm then run-detached"
	@echo "  make logs           Show container logs"
	@echo "  make logs-f         Follow logs"
	@echo "  make shell          sh inside running container"
	@echo "  make ps             List this container"
	@echo "  make clean          rm container and remove image $(IMAGE)"
	@echo "  make rebuild        build-nc after clean"
	@echo ""
	@echo "Variables: IMAGE_NAME IMAGE_TAG CONTAINER_NAME HOST_PORT DOCKER_RUN_EXTRA"

build:
	docker build -t $(IMAGE) -f $(DOCKERFILE) $(CONTEXT)

build-nc:
	docker build --no-cache -t $(IMAGE) -f $(DOCKERFILE) $(CONTEXT)

run: build
	docker run --rm -it \
		-p $(HOST_PORT):8080 \
		$(DOCKER_ENV) \
		$(DOCKER_RUN_EXTRA) \
		--name $(CONTAINER_NAME) \
		$(IMAGE)

run-detached: build
	docker run -d \
		-p $(HOST_PORT):8080 \
		$(DOCKER_ENV) \
		$(DOCKER_RUN_EXTRA) \
		--name $(CONTAINER_NAME) \
		--restart unless-stopped \
		$(IMAGE)

up start: run-detached

stop:
	-docker stop $(CONTAINER_NAME)

rm: stop
	-docker rm $(CONTAINER_NAME)

down: rm

restart: rm run-detached

logs:
	docker logs $(CONTAINER_NAME)

logs-f:
	docker logs -f $(CONTAINER_NAME)

shell:
	docker exec -it $(CONTAINER_NAME) /bin/sh

ps:
	docker ps -a --filter name=$(CONTAINER_NAME)

clean: rm
	-docker rmi $(IMAGE)

rebuild: clean build-nc
