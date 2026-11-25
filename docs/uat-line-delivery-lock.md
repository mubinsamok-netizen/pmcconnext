# UAT branch LINE delivery lock

`zoneidea-upgrade-performance` blocks outbound LINE delivery for every site, including
new sites, regardless of project/group/test-mode settings. The centralized push and
reply functions reject with `LINE_DELIVERY_DISABLED_FOR_BRANCH` before validating tokens
or making any HTTP request. Notification wrappers use the same guard. This is not a
simulated success: send workflows cannot mark delivery successful from the guard.

Accounting LINE webhook POSTs on this branch are acknowledged as ignored before
reading events, downloading LINE images, writing Drive/accounting records, or replying.
Its GET status is `disabled_for_branch`.

Next config embeds the non-sensitive source branch name at build time, preferring
Git when available and deployment metadata for detached/missing Git checkouts.
Runtime metadata is also checked. UAT builds stay blocked if promoted/redeployed.
If no branch metadata is available, delivery fails closed. Known main/other branches
retain their existing behavior. LINE credentials and per-site configuration are
unchanged; there is no request-body/target-group flag that enables UAT delivery.

This applies to builds containing this change. Older immutable deployments still
contain their original code; use the current branch URL for UAT. No client LINE
message or real delivery test is necessary to verify the block.

Validation: `node --test tests/line-delivery-policy.test.cjs` mocks the transport and
verifies zero HTTP calls on UAT, arbitrary existing/new targets, replies, promotion,
missing credentials, and ignored webhooks. Other branches are tested with mock
transport only. No real messages are sent.
