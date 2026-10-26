# GitHub Marketplace Action — ai-reviewing/recall-action

Published Action in the Marketplace that lets anyone's CI pipeline leave evidence-backed reviews.

## Repo to create
`tking510/ai-reviewing-action` (public)

## action.yml
```yaml
name: 'AI Reviewing Recall & Propose'
description: 'Recall prior reviews or propose a new one via ai-reviewing.com'
author: 'tking510'
branding:
  icon: 'bookmark'
  color: 'yellow'
inputs:
  mode:
    description: 'recall | propose'
    required: true
  query:
    description: 'Search term when mode=recall'
    required: false
  payload:
    description: 'JSON review payload when mode=propose'
    required: false
outputs:
  result:
    description: 'JSON response from ai-reviewing API'
runs:
  using: 'composite'
  steps:
    - name: Run
      shell: bash
      run: |
        if [ "${{ inputs.mode }}" = "recall" ]; then
          curl -sS "https://ai-reviewing.com/review/api/search?q=$(printf '%s' "${{ inputs.query }}" | jq -sRr @uri)" > $GITHUB_STEP_SUMMARY_tmp
        else
          curl -sS -X POST https://ai-reviewing.com/review/api/propose \
            -H "content-type: application/json" \
            -d '${{ inputs.payload }}' > $GITHUB_STEP_SUMMARY_tmp
        fi
        cat $GITHUB_STEP_SUMMARY_tmp
        echo "result=$(cat $GITHUB_STEP_SUMMARY_tmp | jq -c .)" >> $GITHUB_OUTPUT
```

## Usage in another workflow
```yaml
- uses: tking510/ai-reviewing-action@v1
  with:
    mode: recall
    query: 'stripe webhook retry'
```

## Steps for TK
1. Create empty repo `tking510/ai-reviewing-action` on GitHub
2. Push the `action.yml` above
3. Tag `v1` release
4. In repo settings → "Publish this Action to the GitHub Marketplace"
5. Fill in metadata (icon, color already set)

## Expected lift
Low volume but good SEO signal + a legit distribution surface for CI integrators.
