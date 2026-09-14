.PHONY: help synth eval rules-test agent-test agent-eval web-typecheck web-test up demo db-migrate db-shell seed seed-demo fmt

help:
	@grep -E '^[a-z-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "};{printf "  %-14s %s\n",$$1,$$2}'

synth:        ## generate synthetic documents + ground truth
	cd extractor && python -m synth.generate --count 100 --out evals/datasets

eval:         ## run extraction evals against thresholds.yaml
	cd extractor && pytest evals -v

rules-test:   ## run the Go rules engine test suite
	cd rules && go test ./... -v -cover

agent-test:   ## agent layer: unit tests plus both eval suites, scripted model
	cd agent && pytest -q

agent-eval:   ## agent eval report (trajectory 3 numbers + guardrail 30/30), no API key
	cd agent && python -m evals.run

web-typecheck: ## review UI: strict TypeScript against the hand-mirrored types
	cd web && npm install --no-audit --no-fund && npm run typecheck

web-test:     ## review UI: pure-function tests (profile builder, identity hash)
	cd web && npm test

up:           ## run the app services against the AWS data/AI in .env
	docker compose up --build

demo:         ## full demo: migrate, compose up, seed policies, import web/.data
	./run.sh demo

db-migrate:   ## apply db/schema.sql to DATABASE_URL (idempotent)
	cd web && node scripts/migrate.mjs

db-shell:     ## psql against DATABASE_URL (via docker, no local psql needed)
	docker run --rm -it postgres:16-alpine psql "$$DATABASE_URL"

seed:         ## embed and upsert the policy and programme index
	docker compose exec -T agent python -m agent.seed

rerender-pages:  ## re-render stored PDF/HEIC upload pages to JPEG via the extractor
	cd web && node scripts/rerender-pages.mjs

seed-demo:    ## five mock students with every document confirmed (Ready), for the programme chat
	cd web && node scripts/seed-demo.mjs

fmt:
	cd extractor && ruff format . && ruff check --fix .
	cd rules && go fmt ./...
