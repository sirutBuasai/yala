# Agent notes

### Punctuation

- No em dashes or en dashes in prose. Use a comma, colon, semicolon, or a new sentence. Two exceptions use the em dash `—`: `NO_VALUE`, and a range between two numbers, written without spaces (`$1,685—$4,660`, `2021—2026`).
- No ellipsis character, instead use `...`.
- A negative figure uses the plain hyphen-minus `-` (`-$100`) and a signed positive one uses `+` (`+$5,707`). No typographic minus or plus characters, in code or in text.
- `&` is fine in a title (`Bill pay & transfers`); spell out `and` in sentences.

### Case and endings by kind of string

| Kind | Case | Ends with | Example |
|---|---|---|---|
| Pane title | Sentence case | nothing | `Log balances` |
| Pane caption | lowercase | nothing | `waiting for posting, refunds, or credits` |
| Button | Sentence case | nothing | `Save changes`, `Add account` |
| Add button | Sentence case | nothing | `+ Add entry`, `+ Log balance` |
| Field, checkbox, column, and review label | Sentence case | nothing | `Institution alias`, `Awaiting reimbursement` |
| Tooltip (`title`) | Sentence case | nothing | `Matches the ledger` |
| `aria-label` | Sentence case | nothing | `Logging date` |
| Placeholder | Sentence case, examples lead with `e.g.` | nothing | `e.g. Coffee`, `Pick an account` |
| Guided-flow question | Sentence case | `?` | `Who issued it?` |
| Hint, subtitle, choice description | Sentence case, full sentence | `.` | `You can reopen the account at a later date.` |
| Validation and status message | Sentence case, full sentence | `.` | `Title is required.`, `Saved.` |
| API error detail | lowercase unless it opens with a name | nothing | `not a transfer`, `{field} does not apply to a card account` |

- A caption built from data may open with a capitalized context half, joined to the rest with ` · `.
- Column headers and group labels are written in sentence case and uppercased by CSS.
- A validation message leads with the field's label: `{Label} is required.`
