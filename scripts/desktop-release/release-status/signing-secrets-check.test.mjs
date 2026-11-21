import assert from "node:assert/strict";
import test from "node:test";

import {
  branchPolicyFailure,
  publicationEnvironmentFailure,
  signingEnvironmentFailure,
} from "./signing-secrets-check.mjs";

const reviewers = [{ type: "User", reviewer: { login: "someone" } }];
const protectedEnvironment = {
  can_admins_bypass: false,
  deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
};

test("the signing environment must stay automatic, refuse administrator bypass and use a custom branch policy", () => {
  assert.equal(signingEnvironmentFailure({ ...protectedEnvironment, protection_rules: [] }, "main"), "");
  assert.match(
    signingEnvironmentFailure({ ...protectedEnvironment, protection_rules: [{ type: "required_reviewers", reviewers }] }, "main"),
    /release-signing must keep signing automatic/,
  );
  assert.equal(
    signingEnvironmentFailure({ ...protectedEnvironment, can_admins_bypass: true }, "main"),
    "release-signing must disable administrator bypass.",
  );
  assert.equal(
    signingEnvironmentFailure({ can_admins_bypass: false, deployment_branch_policy: { protected_branches: true, custom_branch_policies: false } }, "main"),
    "release-signing must use an exact custom branch policy for main.",
  );
});

test("the publication environment must require a reviewer on top of the same protections", () => {
  const withReviewer = { ...protectedEnvironment, protection_rules: [{ type: "required_reviewers", reviewers }] };
  assert.equal(publicationEnvironmentFailure(withReviewer, "main"), "");
  assert.equal(
    publicationEnvironmentFailure({ ...protectedEnvironment, protection_rules: [{ type: "required_reviewers", reviewers: [] }] }, "main"),
    "release must require a publication reviewer.",
  );
  assert.equal(
    publicationEnvironmentFailure({ ...withReviewer, can_admins_bypass: undefined }, "main"),
    "release must disable administrator bypass.",
  );
  assert.equal(
    publicationEnvironmentFailure({ ...withReviewer, deployment_branch_policy: null }, "trunk"),
    "release must use an exact custom branch policy for trunk.",
  );
});

test("an environment admits exactly the default branch and no tag rule", () => {
  const branch = (name) => ({ name, type: "branch" });
  assert.equal(branchPolicyFailure({ branch_policies: [branch("main")] }, "release", "main"), "");
  const refused = "release must allow exactly branch main and no tag rules.";
  assert.equal(branchPolicyFailure({ branch_policies: [branch("main"), branch("dev")] }, "release", "main"), refused);
  assert.equal(branchPolicyFailure({ branch_policies: [branch("dev")] }, "release", "main"), refused);
  assert.equal(branchPolicyFailure({ branch_policies: [{ name: "main", type: "tag" }] }, "release", "main"), refused);
  assert.equal(branchPolicyFailure({}, "release", "main"), refused);
});
