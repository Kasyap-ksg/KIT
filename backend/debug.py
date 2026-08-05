import os, sys, re
sys.stdout.reconfigure(encoding='utf-8')
from server_py.database import SessionLocal
from server_py.models.test_suite import TestCase
db = SessionLocal()
case = db.query(TestCase).order_by(TestCase.id.desc()).first()
g = case.gherkin_script
fill_re = re.compile(r'(?:I |the user )(?:enter|fill|type|input|populate)s?\s+(?:the\s+)?(?:field\s+)?"([^"]+)"\s+(?:field\s+)?with\s+(?:the\s+)?(?:value\s+)?"([^"]+)"', re.IGNORECASE)
lines = g.strip().split('\n')
for l in lines:
    if 'fill' in l:
        stripped = re.sub(r'^(Given|When|And|Then|But)\s+', '', l.strip())
        print(repr(stripped), bool(fill_re.search(stripped)))
