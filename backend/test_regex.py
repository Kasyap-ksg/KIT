import re

old_regex = re.compile(r'(?:I |the user )(?:enter|fill|type|input|populate)s?\s+(?:the\s+)?(?:field\s+)?"([^"]+)"\s+(?:field\s+)?with\s+(?:the\s+)?(?:value\s+)?"([^"]+)"', re.IGNORECASE)

new_regex = re.compile(r'(?:I |the user )(?:enter|fill|type|input|populate)s?\s+(?:in\s+|out\s+)?(?:the\s+)?(?:field\s+)?"([^"]+)"\s*(?:field|input)?\s*with\s+(?:the\s+)?(?:value\s+)?"([^"]+)"', re.IGNORECASE)

nav_old = re.compile(r'(?:I |the user )(?:navigate|go|visit)s?\s+to\s+"([^"]+)"', re.IGNORECASE)
nav_new = re.compile(r'(?:I |the user )(?:navigate|go|visit|am on)s?\s+(?:to\s+)?(?:the\s+)?(?:application\s+)?(?:URL\s+)?(?:page\s+)?"([^"]+)"', re.IGNORECASE)

tests_fill = [
    'I fill "Email" with "john.doe@example.com"',
    'I fill the "Email" field with "jane.smith@example.org"',
    'I fill in "Email" with "john.doe@example.com"',
    'I enter the value "john" into the "Email" field', # wait, this is fill_value_into_field
]

tests_nav = [
    'I navigate to "http://foo.com"',
    'I am on the application URL "http://foo.com"',
]

print("FILL TESTS")
for t in tests_fill:
    print(f"[{'OLD:PASS' if old_regex.search(t) else 'OLD:FAIL'}] [{'NEW:PASS' if new_regex.search(t) else 'NEW:FAIL'}] {t}")

print("\nNAV TESTS")
for t in tests_nav:
    print(f"[{'OLD:PASS' if nav_old.search(t) else 'OLD:FAIL'}] [{'NEW:PASS' if nav_new.search(t) else 'NEW:FAIL'}] {t}")

