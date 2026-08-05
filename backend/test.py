import re
r = re.compile(r'(?:I |the user )(?:enter|fill|type|input|populate)s?\s+(?:the\s+)?(?:field\s+)?"([^"]+)"\s+(?:field\s+)?with\s+(?:the\s+)?(?:value\s+)?"([^"]+)"', re.IGNORECASE)
m = r.search('I fill the "Email" field with "jane.smith@example.org"')
print('MATCHED' if m else 'NOT MATCHED')
