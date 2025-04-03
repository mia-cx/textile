
Separate worker for password hashing? `wrangler dev --persist-to=../hashing-worker/.wrangler/state`
Use bcrypt.

## Storing oauth2 access (& refresh) tokens

symmetrically encrypt all oauth2 tokens with K + S where K is a private key stored in env, and S is the user's password hash used as salt.