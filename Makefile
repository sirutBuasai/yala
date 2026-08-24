# Yala — single entrypoint. Recipes live in scripts/; this file just dispatches.
.PHONY: help bootstrap gen serve serve-api test test-api test-web clean

help:
	@echo "make bootstrap   install backend + frontend deps (first run)"
	@echo "make gen         regenerate contract: data.schema.json + types.ts"
	@echo "make serve       clean, generate data.json, build, serve view-only site"
	@echo "make serve-api   clean, generate data.json, build, serve site + edit API"
	@echo "make test        run backend + frontend test suites"
	@echo "make test-api    run backend tests"
	@echo "make test-web    run frontend tests"
	@echo "make clean       remove build artifacts"

bootstrap:
	python3 scripts/bootstrap.py

gen:
	python3 scripts/gen.py

serve:
	python3 scripts/serve.py web

serve-api:
	python3 scripts/serve.py api

test:
	python3 scripts/test.py all

test-api:
	python3 scripts/test.py api

test-web:
	python3 scripts/test.py web

clean:
	rm -rf apps/web/build apps/web/.svelte-kit apps/api/build
