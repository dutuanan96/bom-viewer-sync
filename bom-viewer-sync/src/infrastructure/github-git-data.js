export class GithubDataConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GithubDataConflictError';
  }
}

export function createGithubGitDataWriter({ config, fetchImpl }) {
  if (!config || typeof config !== 'object' || !config.owner || !config.repo || !config.branch) {
    throw new Error('Config object with owner, repo, and branch is required');
  }
  if (!fetchImpl || typeof fetchImpl !== 'function') {
    throw new Error('fetchImpl function is required');
  }

  const apiBase = `https://api.github.com/repos/${config.owner}/${config.repo}`;

  async function githubFetch(url, options = {}) {
    const res = await fetchImpl(url, options);
    let json;
    try {
      json = await res.json();
    } catch {
      json = {};
    }
    
    if (!res.ok) {
      const err = new Error(json.message || `GitHub API error: ${res.status}`);
      err.status = res.status;
      err.endpoint = url;
      throw err;
    }
    return json;
  }

  return {
    async writeFiles({ token, files, message, expectedHeadSha }) {
      if (!token) throw new Error('token is required');
      if (!files || Object.keys(files).length === 0) throw new Error('files object is required');

      const paths = Object.keys(files).sort();
      for (const p of paths) {
        if (!p || p.startsWith('/') || p.includes('\\') || p.includes('//') || p.includes('./') || p.includes('%2E')) {
          throw new Error(`Invalid or unsafe path: ${p}`);
        }
        const content = files[p];
        if (typeof content !== 'string' && content !== null) {
          throw new Error(`Invalid content for path ${p}, must be string or null`);
        }
      }

      const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      };

      try {
        // 1. Get branch ref
        const refData = await githubFetch(`${apiBase}/git/ref/heads/${config.branch}`, { headers });
        const currentHeadSha = refData.object.sha;

        if (expectedHeadSha && currentHeadSha !== expectedHeadSha) {
          throw new GithubDataConflictError(`Expected HEAD ${expectedHeadSha} but found ${currentHeadSha}`);
        }

        // 2. Get current commit/tree
        const commitData = await githubFetch(`${apiBase}/git/commits/${currentHeadSha}`, { headers });
        const baseTreeSha = commitData.tree.sha;

        // 3. Create blobs
        const treeItems = [];
        for (const p of paths) {
          const content = files[p];
          if (content === null) {
            treeItems.push({
              path: p,
              mode: '100644',
              type: 'blob',
              sha: null
            });
          } else {
            // Use base64 encoding to support arbitrary UTF-8 safely
            // In Node/Browser agnostic way, we can use TextEncoder + btoa or just base64 if Buffer is available
            // Wait, my tests expect base64 because of `Buffer.from(...).toString('base64')`
            let base64Content = '';
            if (typeof Buffer !== 'undefined') {
              base64Content = Buffer.from(content, 'utf8').toString('base64');
            } else {
              // fallback for browser
              const bytes = new TextEncoder().encode(content);
              const binStr = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
              base64Content = globalThis.btoa(binStr);
            }

            const blobData = await githubFetch(`${apiBase}/git/blobs`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                content: base64Content,
                encoding: 'base64'
              })
            });
            
            treeItems.push({
              path: p,
              mode: '100644',
              type: 'blob',
              sha: blobData.sha
            });
          }
        }

        // 4. Create a tree
        const newTreeData = await githubFetch(`${apiBase}/git/trees`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            base_tree: baseTreeSha,
            tree: treeItems
          })
        });

        // 5. Create a commit
        const newCommitData = await githubFetch(`${apiBase}/git/commits`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message,
            tree: newTreeData.sha,
            parents: [currentHeadSha]
          })
        });

        // 6. Update branch ref
        let updateRefData;
        try {
          updateRefData = await githubFetch(`${apiBase}/git/refs/heads/${config.branch}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
              sha: newCommitData.sha,
              force: false
            })
          });
        } catch (err) {
          if (err.status === 409 || err.status === 422) {
            throw new GithubDataConflictError(`Reference update failed: ${err.message}`);
          }
          throw err;
        }

        return {
          previousHeadSha: currentHeadSha,
          commitSha: updateRefData.object.sha
        };
      } catch (err) {
        if (err instanceof GithubDataConflictError) {
          throw err;
        }
        if (err.message && token) {
          err.message = err.message.replace(token, '***');
        }
        throw err;
      }
    }
  };
}
