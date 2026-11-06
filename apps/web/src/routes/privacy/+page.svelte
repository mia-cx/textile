<script lang="ts">
import LegalDocument from '$lib/components/LegalDocument.svelte'

const email = 'hello@mia.cx'
</script>

<LegalDocument path="/privacy" title="Privacy policy">
  <p>
    Mia Riezebos, based in the Netherlands, operates Textile and is responsible for the personal data processing
    described here. Contact <a href="mailto:{email}">{email}</a> for privacy questions or requests. This policy covers
    the Textile Discord application, the hosted Discord MCP relay at
    <a href="https://discord.mia.cx/mcp">discord.mia.cx/mcp</a>, and these policy pages. Independently hosted copies have
    their own operators and policies.
  </p>

  <h2>Discord login</h2>
  <p>
    We use Discord OAuth with the <code>identify</code> scope. Discord supplies your user ID and basic profile
    information, such as username and avatar. We use your user ID, authorisation status, and grant expiry to
    authenticate requests. Login does not request your email address, server list, or messages. We never ask for your
    Discord password or personal account token.
  </p>
  <p>
    The relay processes Discord's OAuth access token and wraps it in an encrypted credential held by your MCP client. It
    rechecks the Discord grant when authenticating requests. There is no server-side account or profile database. The
    credential expires when its grant expires, or after seven days, whichever comes first. We do not issue refresh
    tokens.
  </p>

  <h2>Bot tokens and Discord content</h2>
  <p>
    Your client sends a separate bot token in <code>X-Discord-Bot-Token</code> with each MCP request. The relay
    validates it with Discord and uses it for that request. The relay application does not save bot tokens or cache
    authentication results. HTTPS protects transport, but the relay must read credentials in memory to use them. This is
    not end-to-end encryption.
  </p>
  <p>
    Depending on the requested operation and the bot's permissions, we process Discord IDs, messages, member or server
    details, attachments metadata, and other API request or response data. This can include information about people
    who never sign in to Textile. We receive it from your client or Discord, relay it to its requested destination, and
    do not maintain a message archive or Discord-response cache. We do not monitor Discord in the background.
  </p>
  <p>
    OAuth login does not limit a bot to your personal server permissions. Only send requests and share data that you are
    entitled to process. Do not send sensitive personal data unless the operation is lawful and permitted by Discord's
    rules.
  </p>

  <h2>Cookies, local credentials, and retention</h2>
  <p>
    A necessary, secure, HTTP-only login cookie binds the browser to the OAuth flow. It expires after ten minutes or is
    cleared when the flow completes. Encrypted login state also expires after ten minutes. One-time authorisation codes
    expire after one minute. The relay keeps hashes of used codes in server memory to prevent replay. It removes expired
    hashes when another code is exchanged or the process restarts. Dynamic client registrations expire after thirty
    days and live in the client's encrypted registration credential, not a registry database.
  </p>
  <p>
    Your MCP client decides how it stores its credentials. The optional command-line login helper saves the relay
    credential in a local, owner-readable file. It does not save a bot token. Removing that file does not remove
    credentials saved by another client or revoke the Discord grant.
  </p>
  <p>
    Hosting infrastructure can process IP addresses, request times, paths, response status, and error details for
    operation and security. Access logging is disabled for the hosted MCP route. Infrastructure logs created before that
    change can remain until rotation or deletion. Operational records are retained only while needed for
    troubleshooting, security incidents, or legal obligations. Support emails remain only while needed to handle the
    request and any related legal obligations. Ask us about records relating to you; we do not promise a fixed deletion
    period for records we must legally retain.
  </p>

  <h2>Why we process data</h2>
  <p>
    We process your login and requested operations to provide the service under our <a href="/terms">terms</a>. We rely
    on legitimate interests to operate an authorised relay, protect it from abuse, troubleshoot failures, and respond to
    support requests. This includes handling other people's data only as needed for authorised Discord operations, with
    their rights taken into account. We also process information when required by law. If we rely on consent for an
    optional purpose, you can withdraw it without affecting earlier lawful processing.
  </p>
  <p>
    We do not sell personal data, use Discord data for advertising, or train AI models on it. Textile does not provide
    an AI model itself. We use no advertising cookies or behavioural analytics in the relay.
  </p>

  <h2>Who receives data</h2>
  <p>
    Discord receives credentials and API requests needed to validate access and carry out your operations. Your chosen
    MCP client receives tool results. If you connect an AI provider, that provider may also receive the results and
    retain them under its own policy. Connecting that client instructs us to return the requested data to it. Do not use
    providers or settings that train models on Discord message content without Discord's express permission.
  </p>
  <p>
    The relay runs on our Kubernetes infrastructure. Cloudflare hosts these public policy pages and processes website
    connection data. Infrastructure providers process data needed to deliver their services. We may disclose data where
    legally required or necessary to address abuse or security incidents. Access is limited to people and providers who
    need it for these purposes.
  </p>
  <p>
    Discord, Cloudflare, and your chosen client or AI provider may process data outside your country, including outside
    the European Economic Area. Their processing follows their own policies. Where we arrange an international transfer,
    we must use the safeguards required by applicable law. Contact us for information about applicable providers and
    safeguards. See <a href="https://discord.com/privacy">Discord's privacy policy</a> and
    <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare's privacy policy</a>.
  </p>

  <h2>Your choices and rights</h2>
  <p>
    Stop future access by disconnecting your client and revoking Textile in Discord's Authorised Apps settings. Reset
    your bot token in Discord to invalidate that credential. Changes to messages or server settings persist in Discord
    until someone with permission changes them. Your client or AI provider controls any copies it retains; contact it
    separately for deletion.
  </p>
  <p>
    You can ask us to access, correct, delete, restrict, or provide a portable copy of your personal data, and object to
    processing, where applicable law provides those rights. This applies even if your data passed through the relay
    without you signing in. Email <a href="mailto:{email}">{email}</a> with enough information to identify the relevant
    request or Discord user. Do not send tokens or identity documents unless we arrange a secure, necessary verification
    step. We respond within applicable legal deadlines and explain any lawful limits. We delete data we hold when it is
    no longer needed or a valid deletion request requires it, unless the law requires retention.
  </p>
  <p>
    You may complain to your local data protection authority. In the Netherlands, this is the
    <a href="https://autoriteitpersoonsgegevens.nl/en/submitting-a-tip-off-or-a-complaint-to-the-ap">Autoriteit Persoonsgegevens</a>.
  </p>

  <h2>Children and policy changes</h2>
  <p>
    Textile is not intended for anyone below Discord's minimum age, including a higher local minimum age. Contact us if
    you believe we have processed a child's data improperly. We publish policy changes here with a new effective date
    and provide any notice or consent required by law before using data for a materially different purpose.
  </p>
</LegalDocument>
