import * as https from "https";
import { PackagistSearchResult, PackagistPackageInfo } from "../types";

function httpsGet(url: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Request aborted"));
      return;
    }

    const req = https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
      res.on("error", reject);
    });

    req.on("error", reject);

    if (signal) {
      signal.addEventListener("abort", () => {
        req.destroy();
        reject(new Error("Request aborted"));
      });
    }
  });
}

export async function searchPackages(
  query: string,
  signal?: AbortSignal
): Promise<PackagistSearchResult[]> {
  if (query.length < 2) {
    return [];
  }

  const url = `https://packagist.org/search.json?q=${encodeURIComponent(query)}&per_page=15`;
  const raw = await httpsGet(url, signal);
  const data = JSON.parse(raw);

  return (data.results || []).map((pkg: any) => ({
    name: pkg.name,
    description: pkg.description || "",
    url: pkg.url || "",
    downloads: pkg.downloads || 0,
    favers: pkg.favers || 0,
  }));
}

export async function getPackageInfo(
  packageName: string
): Promise<PackagistPackageInfo | null> {
  try {
    const url = `https://repo.packagist.org/p2/${packageName}.json`;
    const raw = await httpsGet(url);
    const data = JSON.parse(raw);

    const packages = data.packages?.[packageName];
    if (!packages || packages.length === 0) {
      return null;
    }

    const versions: Record<string, any> = {};
    for (const ver of packages) {
      versions[ver.version] = {
        version: ver.version,
        version_normalized: ver.version_normalized,
        time: ver.time,
        require: ver.require,
      };
    }

    return {
      name: packageName,
      description: packages[0]?.description || "",
      versions,
    };
  } catch {
    return null;
  }
}

export function getLatestStableVersion(
  info: PackagistPackageInfo
): string | null {
  const versions = Object.keys(info.versions)
    .filter((v) => !v.includes("dev") && !v.includes("alpha") && !v.includes("beta") && !v.includes("RC"))
    .sort(compareVersions)
    .reverse();

  return versions[0] || null;
}

function compareVersions(a: string, b: string): number {
  const normalize = (v: string) =>
    v.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);

  const partsA = normalize(a);
  const partsB = normalize(b);
  const len = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < len; i++) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}
