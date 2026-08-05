import os, sys
sys.path.append(os.getcwd())
from server_py.routes.test_execution import _parse_gherkin_to_actions

gherkin = """Feature: Test
  Scenario: Test
    Given I am on the application URL "https://hilton--qa.sandbox.my.site.com/s/request-access"
    And I fill the "Email" field with "jane.smith@example.org"
    And I fill in "Email" with "john.doe@example.com"
"""
actions = _parse_gherkin_to_actions(gherkin)
for a in actions:
    print(a)
