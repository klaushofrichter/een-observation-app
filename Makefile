SLUG := observation-app
IMAGE_TAG ?= local
CHART := charts/$(SLUG)

.PHONY: deployment-image test chart-lint chart-template

## Build the production container as <slug>:$(IMAGE_TAG) (CI contract).
deployment-image:
	docker build -t $(SLUG):$(IMAGE_TAG) .

## Smoke test: unit tests + type-check.
test:
	npm ci --no-audit --no-fund
	npm run test:unit
	npx vue-tsc --noEmit

## Helm lint.
chart-lint:
	helm lint $(CHART)

## Render the chart with defaults.
chart-template:
	helm template $(SLUG) $(CHART) --namespace experiments --set image.tag=$(IMAGE_TAG)
