// ==UserScript==
// @name         GitHub Widgets
// @namespace    github.com
// @version      1.0
// @description  Adds widgets that you love to any repo
// @match        https://github.com/*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      api.github.com
// ==/UserScript==

(function () {
    'use strict';

    const CACHE_TIME = 30 * 60 * 1000;
    const COMMIT_SVG = `
        <svg aria-hidden="true" height="16" width="16" viewBox="0 0 16 16" style="margin-right:4px">
            <path d="M6.5 1.75a.75.75 0 0 1 1.5 0v1.55a4.001 4.001 0 0 1 3.7 3.7h1.55a.75.75 0 0 1 0 1.5H11.7a4.001 4.001 0 0 1-3.7 3.7v1.55a.75.75 0 0 1-1.5 0v-1.55a4.001 4.001 0 0 1-3.7-3.7H1.25a.75.75 0 0 1 0-1.5H2.8a4.001 4.001 0 0 1 3.7-3.7ZM7.25 4.75a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/>
        </svg>`;
    function insertError(reason) {
        insertWidget(
            "gh-error",
            `
            <svg aria-hidden="true" height="16" width="16" viewBox="0 0 16 16" style="margin-right:4px">
                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM7.25 4h1.5v5h-1.5V4Zm0 6h1.5v1.5h-1.5V10Z"/>
            </svg>
            `,
            `Error: ${reason}`,
            "GitHub Widgets could not load this widget"
        );
    }
    function insertLoading() {
        insertWidget(
            "gh-loading",
            "",
            "loading ...",
            "GitHub Widgets are loading"
        );
    }
    function githubHeaders() {
        const headers = {
            Accept: "application/vnd.github+json"
        };

        const token = loadSettings().githubToken;

        if (token)
            headers.Authorization = `Bearer ${token}`;

        return headers;
    }
    function format(n) {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
        if (n >= 1000) return (n / 1000).toFixed(1) + "k";
        return String(n);
    }

    function repo() {
        const m = location.pathname.match(/^\/([^\/]+)\/([^\/]+)/);
        return m ? { owner: m[1], repo: m[2] } : null;
    }

    function getActionsRoot() {
        let root = document.querySelector("[data-testid='repo-header-actions']")
        if ( ! root ) {
            root = document.querySelector('#repository-details-container ul');
        }
        if ( !root ) {
            console.error("cannot find repo actions root");
        }
        return root;
    }

    function insertWidget(id, svg, text, description) {

        console.info(`changing ${id}`);

        const loading = document.getElementById("gh-loading");
        if (loading && id !== "gh-loading")
            loading.remove();

        let existing = document.getElementById(id);
        if (existing) {
            existing.title = description;
            existing.innerHTML = `
                <a class="Link--muted d-inline-flex flex-items-center">
                    ${svg}
                    <span>${text}</span>
                </a>
            `;
            return;
        }

        const social = getActionsRoot();
        if (!social)
            return;

        const li = document.createElement("li");
        li.id = id;
        li.className = "btn-sm btn BtnGroup-item";
        li.style.display = "flex";
        li.title = description;

        li.innerHTML = `
            <a class="Link--muted d-inline-flex flex-items-center">
                ${svg}
                <span>${text}</span>
            </a>`;

        social.appendChild(li);
    }

    function formatAge(createdAt) {
        const created = new Date(createdAt);
        const now = new Date();

        let years = now.getFullYear() - created.getFullYear();
        let months = now.getMonth() - created.getMonth();

        if (months < 0) {
            years--;
            months += 12;
        }

        if (years > 0)
            return `${years}y ${months}m`;

        return `${months}m`;
    }

    function insertDownloads(total) {
        insertWidget(
            "gh-download-counter",
            `
                     <svg aria-hidden="true" height="16" width="16" viewBox="0 0 16 16" style="margin-right:4px">
                          <path d="M8 1a.75.75 0 0 1 .75.75v6.69l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 0 1 1.06-1.06l2.22 2.22V1.75A.75.75 0 0 1 8 1Z"/>
                     </svg>
                    `,
            format(total),
            "Total number of downloads of all release assets"
        );
    }
    function insertCreatedAt(created_at) {
        insertWidget(
                    "gh-age-counter",
                    `
                    <svg aria-hidden="true" height="16" width="16" viewBox="0 0 16 16" style="margin-right:4px">
                        <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm.75 4v4.19l2.53 1.46-.75 1.3L7.25 9V4h1.5Z"/>
                    </svg>
                    `,
                    formatAge(created_at),
                    "Time elapsed since the repository was created"
                );
    }
    function insertAllFromCache() {
        const r = repo();
        if (!r)
            return false;

        const settings = loadSettings();
        const key = `${r.owner}/${r.repo}`;

        const cached = GM_getValue(key);

        if (cached && Date.now() - cached.time < CACHE_TIME) {
            if ( settings.downloads )
                insertDownloads(cached.downloads);
            if ( settings.repositoryAge )
                insertCreatedAt(cached.created_at);
            if ( settings.downloadsWeek )
                insertDownloadsPerWeek(cached.downloads, cached.created_at);
            if ( settings.averageCommitsPerWeek ) 
                insertAverageCommitsPerWeek(cached.averageCommitsPerWeek);
            removeLoading();
            return true;
        }
        return false;
    }
    function loadState(key) {
        return GM_getValue(key, {});
    }
    function formatFloat(n) {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
        if (n >= 1000) return (n / 1000).toFixed(1) + "k";
        return n.toFixed(1);
    }
    function downloadsPerWeek(downloads, createdAt) {
        const created = new Date(createdAt);
        const weeks = Math.max(1, (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24 * 7));
        return downloads / weeks;
    }
    function removeLoading() {
        const loading = document.getElementById("gh-loading");
        if (loading && id !== "gh-loading")
            loading.remove();
    }
    function insertDownloadsPerWeek(downloads, created_at) {
        insertWidget(
            "gh-download-week-counter",
            `
            <svg aria-hidden="true" height="16" width="16" viewBox="0 0 16 16" style="margin-right:4px">
                <path d="M2.75 0A.75.75 0 0 1 3.5.75V2h9V.75a.75.75 0 0 1 1.5 0V2h.25A1.75 1.75 0 0 1 16 3.75v10.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25V3.75A1.75 1.75 0 0 1 1.75 2H2V.75A.75.75 0 0 1 2.75 0ZM1.5 6v8.25c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V6Z"/>
            </svg>
            `,
            `${formatFloat(downloadsPerWeek(downloads, created_at))}/w`,
            "Average number of release asset downloads per week since the repository was created"
        );
    }
    function insertAverageCommitsPerWeek(averageCommitsPerWeek_var) {
        insertWidget(
            "gh-commits-week",
            COMMIT_SVG,
            `${averageCommitsPerWeek_var}/w`,
            "Average number of commits per week based on GitHub participation statistics"
        );
    }
    function averageCommitsPerWeek(all) {
        if (!all.length)
            return "-";

        const total = all.reduce((a, b) => a + b, 0);

        return formatFloat(total / all.length);
    }
    async function load() {

        console.debug("loading wigets");
        const r = repo();
        if (!r)
            return;

        const key = `${r.owner}/${r.repo}`;

        const settings = loadSettings();

        if ( ! settings.cacheEnabled || ! insertAllFromCache() ) {
            if (settings.downloads || settings.downloadsWeek ) {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: `https://api.github.com/repos/${r.owner}/${r.repo}/releases`,
                    headers: githubHeaders(),
                    onload: function (res) {
                        if (res.status !== 200) {
                            insertError(`releases API: HTTP ${res.status}`);
                            return;
                        }

                        try {
                            const releases = JSON.parse(res.responseText);

                            let total = 0;

                            for (const rel of releases)
                                for (const asset of rel.assets)
                                    total += asset.download_count;

                            let data = loadState(key);
                            data.downloads = total;
                            data.time = Date.now();
                            GM_setValue(key, data);

                            if (settings.downloads)
                                insertDownloads(total);

                            if (settings.downloadsWeek)
                                if (data.created_at)
                                    insertDownloadsPerWeek(total, data.created_at);

                        } catch (e) {
                            insertError(`releases API: ${e.message}`);
                        }
                        removeLoading();
                    },
                    onerror: function (e) {
                        insertError("releases API: network error");
                        removeLoading();
                    }
                });
            }
            if ( settings.averageCommitsPerWeek ) {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: `https://api.github.com/repos/${r.owner}/${r.repo}/stats/participation`,
                    headers: githubHeaders(),
                    onload(res) {
                        if (res.status !== 200) {
                            insertError(`participation API: HTTP ${res.status}`);
                            return;
                        }

                        try {
                            const stats = JSON.parse(res.responseText);

                            let data = loadState(key);
                            let avg = averageCommitsPerWeek(stats.all);
                            data.averageCommitsPerWeek = avg;
                            data.time = Date.now();
                            GM_setValue(key, data);
                            insertAverageCommitsPerWeek(avg);

                        } catch (e) {
                            insertError(`participation API: ${e.message}`);
                        }
                        removeLoading();
                    },
                    onerror() {
                        insertError("participation API: network error");
                        removeLoading();
                    }
                });
            }
            if ( settings.downloadsWeek || settings.repositoryAge ) {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: `https://api.github.com/repos/${r.owner}/${r.repo}`,
                    headers: githubHeaders(),
                    onload(res) {
                        if (res.status !== 200) {
                            insertError(`repository API: HTTP ${res.status}`);
                            return;
                        }

                        try {
                            const repository = JSON.parse(res.responseText);

                            let data = loadState(key);
                            data.created_at = repository.created_at;
                            data.time = Date.now();
                            GM_setValue(key, data);

                            if (settings.repositoryAge)
                                insertCreatedAt(repository.created_at);

                            if (settings.downloadsWeek)
                                if (data.downloads != null)
                                    insertDownloadsPerWeek(data.downloads, repository.created_at);

                        } catch (e) {
                            insertError(`repository API: ${e.message}`);
                        }
                        removeLoading();
                    },
                    onerror() {
                        insertError("repository API: network error");
                        removeLoading();
                    }
                });
            }
        }
    }
    const SETTINGS_KEY = "settings";

    function loadSettings() {
        return Object.assign({
            downloads: true,
            downloadsWeek: true,
            repositoryAge: true,
            averageCommitsPerWeek: true,
            cacheEnabled: false,
            githubToken: ""
        }, GM_getValue(SETTINGS_KEY, {}));
    }

    function saveSettings(settings) {
        GM_setValue(SETTINGS_KEY, settings);
    }

    function showSettings() {

        if (document.getElementById("ghw-settings-modal"))
            return;

        const settings = loadSettings();

        const overlay = document.createElement("div");
        overlay.id = "ghw-settings-modal";
        overlay.style = `
            position:fixed;
            inset:0;
            background:rgba(0,0,0,.45);
            display:flex;
            align-items:center;
            justify-content:center;
            z-index:999999;
        `;

        const dialog = document.createElement("div");
        dialog.style = `
            width:420px;
            background:var(--color-canvas-default,#fff);
            color:var(--color-fg-default,#24292f);
            border:1px solid var(--color-border-default,#d0d7de);
            border-radius:8px;
            box-shadow:0 8px 24px rgba(0,0,0,.25);
            padding:16px;
            font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        `;

        dialog.innerHTML = `
            <h3 style="margin:0 0 16px 0;">GitHub Widgets</h3>

            <label style="display:block;margin:16px 0 8px 0;">
                GitHub Personal Access Token
            </label>

            <input
                id="ghw-githubToken"
                type="password"
                value="${settings.githubToken}"
                placeholder="ghp_..."
                style="
                    width:100%;
                    box-sizing:border-box;
                    padding:6px 8px;
                    border:1px solid var(--color-border-default,#d0d7de);
                    border-radius:6px;
                    background:var(--color-canvas-default,#fff);
                    color:inherit;
                ">

            <label style="display:block;margin:8px 0;">
                <input id="ghw-downloads" type="checkbox" ${settings.downloads ? "checked" : ""}>
                Total downloads
            </label>

            <label style="display:block;margin:8px 0;">
                <input id="ghw-downloadsWeek" type="checkbox" ${settings.downloadsWeek ? "checked" : ""}>
                Downloads/week
            </label>

            <label style="display:block;margin:8px 0;">
                <input id="ghw-averageCommitsPerWeek" type="checkbox" ${settings.averageCommitsPerWeek ? "checked" : ""}>
                Commits/week
            </label>

            <label style="display:block;margin:8px 0;">
                <input id="ghw-repositoryAge" type="checkbox" ${settings.repositoryAge ? "checked" : ""}>
                Repository age
            </label>

            <label style="display:block;margin:8px 0;">
                <input id="ghw-cacheEnabled" type="checkbox" ${settings.cacheEnabled ? "checked" : ""}>
                Cache enabled
            </label>

            <div style="margin-top:20px;text-align:right;">
                <button id="ghw-cancel" class="btn btn-sm">Cancel</button>
                <button id="ghw-save" class="btn btn-sm btn-primary">Save</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        overlay.addEventListener("click", e => {
            if (e.target === overlay)
                overlay.remove();
        });

        dialog.querySelector("#ghw-cancel").onclick = () => {
            overlay.remove();
        };

        dialog.querySelector("#ghw-save").onclick = () => {

            saveSettings({
                downloads: dialog.querySelector("#ghw-downloads").checked,
                downloadsWeek: dialog.querySelector("#ghw-downloadsWeek").checked,
                repositoryAge: dialog.querySelector("#ghw-repositoryAge").checked,
                averageCommitsPerWeek: dialog.querySelector("#ghw-averageCommitsPerWeek").checked,
                cacheEnabled: dialog.querySelector("#ghw-cacheEnabled").checked,
                githubToken: dialog.querySelector("#ghw-githubToken").value.trim()
            });

            overlay.remove();
            location.reload();
        };
    }

    function observeActionsRoot() {
        const root = getActionsRoot();

        if (!root) {
            setTimeout(observeActionsRoot, 500);
            return;
        }

        insertLoading();

        const observer = new MutationObserver(load);

        observer.observe(root, {
            childList: true,
            subtree: true
        });

        load();
    }

    observeActionsRoot();
    GM_registerMenuCommand("⚙ GitHub Widgets Settings", showSettings);

})();