"""
Fetches all files from a GitHub repo using the GitHub API.
Handles rate limits, binary files, and large repos gracefully.
"""
import httpx
import base64
import asyncio
from typing import List, Dict, Any
from config import get_settings

settings = get_settings()

# Extensions we can meaningfully embed
TEXT_EXTENSIONS = {
    ".py", ".ts", ".js", ".tsx", ".jsx", ".mjs", ".cjs",
    ".md", ".mdx", ".txt", ".rst",
    ".json", ".yaml", ".yml", ".toml", ".cfg", ".ini",
    ".sql", ".sh", ".bash", ".zsh",
    ".html", ".css", ".scss",
    ".ipynb",
    ".dockerfile", ".env.example",
    ".java", ".go", ".rs", ".cpp", ".c", ".h",
    ".tf", ".hcl",                   # Terraform / infra
    ".xml",
}

SKIP_DIRS = {
    "node_modules", ".git", "__pycache__", ".next", "dist",
    "build", ".venv", "venv", "env", ".mypy_cache", "coverage",
    ".pytest_cache", "vendor",
}


def parse_github_url(url: str) -> tuple[str, str]:
    """Returns (owner, repo) from a GitHub URL."""
    url = url.rstrip("/").replace("https://github.com/", "").replace("http://github.com/", "")
    parts = url.split("/")
    if len(parts) < 2:
        raise ValueError(f"Invalid GitHub URL: {url}")
    return parts[0], parts[1]


async def fetch_repo_files(
    repo_url: str,
    branch: str = "main",
    include_extensions: List[str] = None,
    max_files: int = 200,
) -> List[Dict[str, Any]]:
    """
    Fetch all text files from a GitHub repo.
    Returns list of { path, content, extension, size }
    """
    owner, repo = parse_github_url(repo_url)
    headers = {"Accept": "application/vnd.github.v3+json"}
    if settings.github_token:
        headers["Authorization"] = f"token {settings.github_token}"

    extensions = set(include_extensions or TEXT_EXTENSIONS)
    collected: List[Dict[str, Any]] = []

    async with httpx.AsyncClient(timeout=30, headers=headers) as client:
        # First try to get the tree recursively (most efficient)
        try:
            tree_url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
            r = await client.get(tree_url)
            if r.status_code == 422:
                # Repo too large for recursive fetch — fallback to root
                return await _fetch_tree_paginated(client, owner, repo, branch, extensions, max_files)
            r.raise_for_status()
            tree = r.json()
        except httpx.HTTPStatusError as e:
            # Only retry with 'master' if branch not found (404), not auth errors
            if e.response.status_code == 404 and branch == "main":
                return await fetch_repo_files(repo_url, "master", include_extensions, max_files)
            raise e
        except Exception as e:
            raise e

        blobs = [
            item for item in tree.get("tree", [])
            if item["type"] == "blob"
            and any(item["path"].endswith(ext) for ext in extensions)
            and not any(skip in item["path"].split("/") for skip in SKIP_DIRS)
            and item.get("size", 0) < 300_000      # skip files > 300KB
        ][:max_files]

        # Fetch file contents in parallel batches
        BATCH = 10
        for i in range(0, len(blobs), BATCH):
            batch = blobs[i:i + BATCH]
            tasks = [_fetch_file(client, owner, repo, b["path"], branch) for b in batch]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for item, result in zip(batch, results):
                if isinstance(result, str) and result:
                    ext = "." + item["path"].split(".")[-1] if "." in item["path"] else ""
                    collected.append({
                        "path": item["path"],
                        "content": result,
                        "extension": ext,
                        "size": len(result),
                    })

    return collected


async def _fetch_file(client: httpx.AsyncClient, owner: str, repo: str, path: str, branch: str) -> str:
    try:
        url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}"
        r = await client.get(url)
        r.raise_for_status()
        data = r.json()
        if data.get("encoding") == "base64":
            return base64.b64decode(data["content"]).decode("utf-8", errors="ignore")
        return data.get("content", "")
    except Exception:
        return ""


async def _fetch_tree_paginated(client, owner, repo, branch, extensions, max_files):
    """Fallback: fetch root directory contents only."""
    url = f"https://api.github.com/repos/{owner}/{repo}/contents?ref={branch}"
    r = await client.get(url)
    r.raise_for_status()
    items = r.json()
    collected = []
    for item in items[:max_files]:
        if item["type"] == "file" and any(item["name"].endswith(ext) for ext in extensions):
            content = await _fetch_file(client, owner, repo, item["path"], branch)
            if content:
                ext = "." + item["name"].split(".")[-1] if "." in item["name"] else ""
                collected.append({"path": item["path"], "content": content, "extension": ext, "size": len(content)})
    return collected
