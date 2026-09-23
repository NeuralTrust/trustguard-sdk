#!/usr/bin/env bash
# Bump TrustGuard packages and/or tag them.
#
# One package or all three. Pushing the matching tag is what publishes:
# node-vX.Y.Z → npm, python-vX.Y.Z → PyPI, go/vX.Y.Z is the module version
# itself (nothing to upload).
#
#   scripts/release.sh node 0.1.4
#   scripts/release.sh python 0.1.4 --tag
#   scripts/release.sh all 0.1.4 --tag --push
#   scripts/release.sh all tag --push
#

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

usage() {
  cat <<'EOF'
Bump TrustGuard packages and/or tag them.

  scripts/release.sh node 0.1.4              write node/package.json, stop
  scripts/release.sh python 0.1.4 --tag      write, commit, tag python-v0.1.4
  scripts/release.sh all 0.1.4               write node + python, stop
  scripts/release.sh all 0.1.4 --tag --push  one commit, three tags, push
  scripts/release.sh all tag --push          tag whatever is already in the files

Go has no manifest; its version is the tag. `all` uses the Node/Python version
for `go/vX.Y.Z` too. Update CHANGELOG.md in the same change as a bump.
EOF
  exit 2
}

PKG=""
VERSION=""
DO_TAG=0
DO_PUSH=0
TAG_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h | --help) usage ;;
    --tag) DO_TAG=1 ;;
    --push)
      DO_TAG=1
      DO_PUSH=1
      ;;
    tag)
      TAG_ONLY=1
      DO_TAG=1
      ;;
    node | python | go | all)
      if [[ -n "$PKG" ]]; then
        echo "unexpected argument: $1" >&2
        usage
      fi
      PKG="$1"
      ;;
    -*)
      echo "unknown flag: $1" >&2
      usage
      ;;
    *)
      if [[ -n "$VERSION" ]]; then
        echo "unexpected argument: $1" >&2
        usage
      fi
      VERSION="$1"
      ;;
  esac
  shift
done

[[ -n "$PKG" ]] || usage

if [[ "$TAG_ONLY" -eq 1 && -n "$VERSION" ]]; then
  echo "tag uses the version already in the files; do not pass one" >&2
  exit 2
fi
if [[ "$PKG" == "go" && "$TAG_ONLY" -eq 1 ]]; then
  echo "go has no manifest version; pass X.Y.Z, e.g. scripts/release.sh go 0.1.0 --tag" >&2
  exit 2
fi
if [[ "$TAG_ONLY" -eq 0 && -z "$VERSION" ]]; then
  usage
fi

semver='^[0-9]+\.[0-9]+\.[0-9]+$'

packages() {
  case "$PKG" in
    all) echo node python go ;;
    *) echo "$PKG" ;;
  esac
}

pkg_version() {
  case "$1" in
    node) jq -r .version node/package.json ;;
    python) sed -n 's/^version = "\(.*\)"$/\1/p' python/pyproject.toml ;;
    go) echo "$VERSION" ;;
  esac
}

tag_name() {
  case "$1" in
    node) echo "node-v$2" ;;
    python) echo "python-v$2" ;;
    go) echo "go/v$2" ;;
  esac
}

shared_version() {
  local node_v python_v
  node_v=$(pkg_version node)
  python_v=$(pkg_version python)
  if [[ "$node_v" != "$python_v" ]]; then
    echo "node is $node_v and python is $python_v; they must match for all" >&2
    exit 1
  fi
  echo "$node_v"
}

bump_one() {
  local pkg="$1"
  local version="$2"
  local now
  now=$(pkg_version "$pkg")
  if [[ "$pkg" != "go" && "$now" == "$version" ]]; then
    echo "$pkg already at $version"
    return 0
  fi

  case "$pkg" in
    node)
      (cd node && npm version "$version" --no-git-tag-version --allow-same-version >/dev/null)
      ;;
    python)
      python3 - "$version" <<'PY'
from pathlib import Path
import re
import sys

version = sys.argv[1]
path = Path("python/pyproject.toml")
text = path.read_text(encoding="utf-8")
new, n = re.subn(r'(?m)^version = "[^"]+"', f'version = "{version}"', text, count=1)
if n != 1:
    sys.exit("could not bump python/pyproject.toml")
path.write_text(new, encoding="utf-8")
PY
      (cd python && uv lock)
      ;;
    go) return 0 ;;
  esac

  now=$(pkg_version "$pkg")
  if [[ "$now" != "$version" ]]; then
    echo "bump left $pkg at $now, expected $version" >&2
    exit 1
  fi
  echo "bumped $pkg → $version"
}

bump() {
  local version="$1"
  local pkg now changed=0
  if [[ ! "$version" =~ $semver ]]; then
    echo "version must be X.Y.Z, got: $version" >&2
    exit 2
  fi
  for pkg in $(packages); do
    now=$(pkg_version "$pkg")
    if [[ "$pkg" != "go" && "$now" != "$version" ]]; then
      changed=1
    fi
    bump_one "$pkg" "$version"
  done
  if [[ "$changed" -eq 0 && "$PKG" != "go" && "$DO_TAG" -eq 0 ]]; then
    echo "already at $version" >&2
    exit 1
  fi
}

create_tags() {
  local version="$1"
  local pkg tag
  if [[ ! "$version" =~ $semver ]]; then
    echo "refusing to tag non-release version ${version:-<empty>}" >&2
    exit 1
  fi

  for pkg in $(packages); do
    tag="$(tag_name "$pkg" "$version")"
    if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
      echo "tag $tag already exists" >&2
      exit 1
    fi
  done

  if [[ -n "$(git status --porcelain)" ]]; then
    case "$PKG" in
      node) git add node/package.json node/package-lock.json ;;
      python) git add python/pyproject.toml python/uv.lock ;;
      all)
        git add node/package.json node/package-lock.json
        git add python/pyproject.toml python/uv.lock
        ;;
      go)
        echo "go release should not have a dirty tree" >&2
        exit 1
        ;;
    esac
    git commit -m "chore($PKG): release $version"
  fi

  for pkg in $(packages); do
    tag="$(tag_name "$pkg" "$version")"
    git tag -a "$tag" -m "$tag"
    echo "tagged $tag"
  done
}

push_tags() {
  local version="$1"
  local pkg tag branch
  branch="$(git branch --show-current)"
  git push origin "$branch"
  for pkg in $(packages); do
    tag="$(tag_name "$pkg" "$version")"
    git push origin "$tag"
    echo "pushed $tag"
  done
}

allowed_dirty() {
  case "$PKG" in
    node)
      case "$1" in node/package.json | node/package-lock.json) return 0 ;; esac
      ;;
    python)
      case "$1" in python/pyproject.toml | python/uv.lock) return 0 ;; esac
      ;;
    all)
      case "$1" in
        node/package.json | node/package-lock.json | python/pyproject.toml | python/uv.lock) return 0 ;;
      esac
      ;;
  esac
  return 1
}

if [[ -n "$(git status --porcelain)" ]]; then
  if [[ "$TAG_ONLY" -eq 0 ]]; then
    echo "working tree is dirty; commit or stash first" >&2
    exit 1
  fi
  unexpected=0
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    if ! allowed_dirty "$path"; then
      echo "unexpected dirty file: $path" >&2
      unexpected=1
    fi
  done < <(git status --porcelain | cut -c4-)
  if [[ "$unexpected" -eq 1 ]]; then
    echo "commit or stash unrelated changes before tagging" >&2
    exit 1
  fi
fi

if [[ "$TAG_ONLY" -eq 1 ]]; then
  if [[ "$PKG" == "all" ]]; then
    VERSION=$(shared_version)
  else
    VERSION=$(pkg_version "$PKG")
  fi
fi

if [[ "$TAG_ONLY" -eq 0 ]]; then
  bump "$VERSION"
  if [[ "$PKG" == "go" && "$DO_TAG" -eq 0 ]]; then
    echo "go has no files to bump. tag with: scripts/release.sh go $VERSION --tag"
    exit 0
  fi
fi

if [[ "$DO_TAG" -eq 1 ]]; then
  create_tags "$VERSION"
fi

if [[ "$DO_PUSH" -eq 1 ]]; then
  push_tags "$VERSION"
elif [[ "$DO_TAG" -eq 0 ]]; then
  echo "files only. update CHANGELOG.md, then: scripts/release.sh $PKG tag --push"
fi
