#!/usr/bin/env bash
# Export the repository's GitHub Discussions to data/discussions.json for the site's live feed.
# Usage: refresh-discussions.sh <owner> <repo> <output-path>
# Requires: gh (authenticated via GH_TOKEN) and jq.
set -euo pipefail

OWNER="${1:-citycomputingcollective}"
REPO="${2:-citycomputingcollective.github.io}"
OUT="${3:-data/discussions.json}"

QUERY='query($owner:String!,$name:String!){
  repository(owner:$owner,name:$name){
    discussions(first:50,orderBy:{field:UPDATED_AT,direction:DESC}){
      nodes{ title url createdAt updatedAt category{name slug} author{login} comments{totalCount} }
    }
  }
}'

gh api graphql -f query="$QUERY" -F owner="$OWNER" -F name="$REPO" \
  | jq '{
      generated: (now | todate),
      discussions: [ .data.repository.discussions.nodes[] | {
        title, url, createdAt, updatedAt,
        category: .category.slug,
        categoryName: .category.name,
        author: (.author.login // "ghost"),
        comments: .comments.totalCount
      } ]
    }' > "$OUT.tmp"

if [ -f "$OUT" ] && [ "$(jq -c .discussions "$OUT.tmp")" = "$(jq -c .discussions "$OUT")" ]; then
  rm -f "$OUT.tmp"
  echo "unchanged"
  exit 0
fi

mv "$OUT.tmp" "$OUT"
echo "updated: $(jq '.discussions | length' "$OUT") discussions"
