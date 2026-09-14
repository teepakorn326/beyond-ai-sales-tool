.PHONY: help synth eval rules-test agent-test agent-eval web-typecheck up fmt

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

up:           ## run the whole stack locally
	docker compose up --build

fmt:
	cd extractor && ruff format . && ruff check --fix .
	cd rules && go fmt ./...
