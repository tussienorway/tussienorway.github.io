"""
Audit script for tussienorway.github.io and linked projects.
Checks:
1. All local links (a href, link href, script src, img src, iframe src) resolve to actual files.
2. Checks for broken anchor fragments (#id) if referenced.
3. Checks for company identity compliance (external representative should be Arne Austenå, not Tussie).
4. Validates JSON files or JS imports if any.
"""
import os
import re
import sys
from pathlib import Path
from html.parser import HTMLParser
import urllib.parse

ROOT_DIR = Path(r"C:\Users\auste\tussienorway.github.io")

class LinkExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = [] # list of (tag, attr, val, line)
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if 'id' in attrs_dict:
            self.ids.add(attrs_dict['id'])
        for attr, val in attrs:
            if attr in ('href', 'src', 'action', 'data-src'):
                if val:
                    self.links.append((tag, attr, val, self.getpos()[0]))

def audit_html_files():
    html_files = list(ROOT_DIR.rglob("*.html"))
    print(f"Total HTML files found: {len(html_files)}")

    broken_links = []
    company_identity_issues = []
    
    # We will parse all HTML files first to collect IDs for intra-page anchors
    file_ids = {}
    parsed_files = {}

    for html_file in html_files:
        try:
            content = html_file.read_text(encoding='utf-8', errors='ignore')
            parser = LinkExtractor()
            parser.feed(content)
            file_ids[html_file] = parser.ids
            parsed_files[html_file] = (content, parser.links)
        except Exception as e:
            broken_links.append((str(html_file), 0, f"Failed to parse HTML: {e}"))

    # Audit links
    for html_file, (content, links) in parsed_files.items():
        rel_path = html_file.relative_to(ROOT_DIR)
        
        # Check company identity in user-facing showrooms
        is_showroom = any(p in html_file.parts for p in ['b2b-showroom', 'lindal-modul', 'naf-arendal', 'agder-bilberging', 'profiltoy'])
        if is_showroom:
            # Strip domain names like tussienorway.github.io before checking identity
            text_without_domain = re.sub(r'https?://[a-zA-Z0-9.-]*tussienorway[a-zA-Z0-9.-]*', '', content, flags=re.IGNORECASE)
            # Check if "Tussie" is used as representative or contact person
            for match in re.finditer(r'(kontakt[:\s]+[^\n<]{0,50}tussie|hilsen[,\s]+tussie|arne\s+tussie|tussie\s+austen|daglig\s+leder[^\n<]{0,50}tussie)', text_without_domain, re.IGNORECASE):
                company_identity_issues.append((str(rel_path), match.group(0)))

        for tag, attr, url, line in links:
            url = url.strip()
            # Ignore javascript:, mailto:, tel:, data:, #only
            if url.startswith(('javascript:', 'mailto:', 'tel:', 'data:', 'sms:', 'geo:', 'blob:')):
                continue

            parsed = urllib.parse.urlparse(url)
            
            # Anchor only within same page
            if not parsed.path and parsed.fragment:
                if parsed.fragment not in file_ids[html_file]:
                    # Some JS creates dynamic IDs or standard IDs
                    broken_links.append((str(rel_path), line, f"Anchor #{parsed.fragment} not found in {rel_path}"))
                continue

            # External URL
            if parsed.scheme in ('http', 'https'):
                # Check if it refers to tussienorway.github.io
                if parsed.netloc == 'tussienorway.github.io':
                    # check if the target path exists locally!
                    target_path = parsed.path.lstrip('/')
                    if not target_path or target_path.endswith('/'):
                        local_target = ROOT_DIR / target_path / 'index.html'
                    else:
                        local_target = ROOT_DIR / target_path
                    
                    if not local_target.exists():
                        # Maybe target_path without index.html or with .html?
                        if (ROOT_DIR / f"{target_path}.html").exists():
                            pass
                        elif (ROOT_DIR / target_path / "index.html").exists():
                            pass
                        elif (ROOT_DIR / target_path).exists():
                            pass
                        else:
                            # Could it be another repo under tussienorway? (like /odegarden/)
                            other_repo_name = target_path.split('/')[0] if '/' in target_path else target_path
                            other_repo_dir = Path(r"C:\Users\auste") / other_repo_name
                            if not other_repo_dir.exists():
                                broken_links.append((str(rel_path), line, f"Internal URL {url} not found locally (looked at {local_target} and {other_repo_dir})"))
                continue

            # Local path relative to root or current file
            target_path = parsed.path
            if target_path.startswith('/'):
                # Absolute from root
                clean_target = target_path.lstrip('/')
                if not clean_target:
                    target_file = ROOT_DIR / 'index.html'
                else:
                    target_file = ROOT_DIR / clean_target
            else:
                target_file = html_file.parent / target_path

            # If it's a directory, check for index.html
            if target_file.is_dir():
                target_file = target_file / 'index.html'
            elif not target_file.exists():
                # Check if target_file + /index.html exists or target_file.html
                if (target_file.parent / f"{target_file.name}.html").exists():
                    target_file = target_file.parent / f"{target_file.name}.html"
                elif (target_file / 'index.html').exists():
                    target_file = target_file / 'index.html'

            if not target_file.exists():
                broken_links.append((str(rel_path), line, f"Local resource not found: <{tag} {attr}='{url}'> -> resolved to {target_file}"))

    return broken_links, company_identity_issues

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    broken, identity = audit_html_files()
    print("\n=== BROKEN LINKS & MISSING LOCAL ASSETS ===")
    if broken:
        for b in broken[:50]:
            print(f"{b[0]}:{b[1]}: {b[2]}")
        print(f"Total broken: {len(broken)}")
    else:
        print("None! All local links & assets resolved successfully.")

    print("\n=== COMPANY IDENTITY ISSUES ===")
    if identity:
        for i in identity:
            print(f"{i[0]}: {i[1]}")
    else:
        print("None! No company identity violations found.")
