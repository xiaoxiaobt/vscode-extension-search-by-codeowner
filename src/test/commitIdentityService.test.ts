import assert from "node:assert/strict";
import test from "node:test";
import { parseCommitIdentities } from "../profile/commitIdentityService";

test("commit identities resolve a single name case-insensitively", () => {
  const identities = parseCommitIdentities(
    "Jerry Jackson\0Jerry@example.com\nJERRY JACKSON\0jerry@example.com\n",
  );
  assert.equal(identities.getName("JERRY@EXAMPLE.COM"), "JERRY JACKSON");
});

test("commit identities reject ambiguous email-to-name mappings", () => {
  const identities = parseCommitIdentities(
    "Jerry Jackson\0person@example.com\nSomeone Else\0person@example.com\n",
  );
  assert.equal(identities.getName("person@example.com"), null);
});
