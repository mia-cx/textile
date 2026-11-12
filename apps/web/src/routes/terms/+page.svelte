<script lang="ts">
import LegalDocument from '$lib/components/LegalDocument.svelte'

const email = 'hello@mia.cx'
</script>

<LegalDocument path="/terms" title="Terms of service">
  <p>
    Textile is operated by Mia Riezebos in the Netherlands. These terms cover the Textile Discord application and the
    hosted Discord MCP service at <a href="https://discord.mia.cx/mcp">discord.mia.cx/mcp</a>. Using the service means
    you agree to these terms. If you do not agree, do not use it.
  </p>

  <h2>What Textile does</h2>
  <p>
    Textile lets an MCP-compatible client, including an AI agent, call supported Discord API operations. You sign in
    through Discord OAuth and supply a Discord bot token with each MCP request. The relay sends the requested operation
    to Discord and returns Discord's response to your client. Textile is independent of Discord and is not endorsed by
    Discord.
  </p>
  <p>
    Discord login identifies you. It does not prove that you own the supplied bot. Requests act with the bot's
    permissions, not the signed-in person's server permissions. Supported tools can read messages, send or edit
    content, and perform administrative or destructive actions. The relay does not add a separate confirmation step for
    those actions.
  </p>

  <h2>Who may use it</h2>
  <p>
    You must meet Discord's minimum age requirements, including any higher minimum age in your country. If you cannot
    legally accept these terms yourself, a parent or guardian must agree where the law allows. When acting for an
    organisation, you must have authority to bind it.
  </p>
  <p>
    Only supply bot credentials you own or have permission to use. Never supply a personal Discord account token or
    password. Keep your OAuth credentials and bot tokens private. Limit bot permissions and configure your client to
    supervise actions appropriately.
  </p>

  <h2>Use it responsibly</h2>
  <p>
    You are responsible for the clients and agents you connect, their instructions, and the actions you authorise.
    Obtain the permissions and legal basis needed to access, process, or share other people's Discord data. A working
    bot token is not permission to use that data for any purpose.
  </p>
  <p>
    Follow applicable law, server rules, <a href="https://discord.com/terms">Discord's terms</a>,
    <a href="https://discord.com/guidelines">Community Guidelines</a>, and applicable
    <a href="https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy">developer policies</a>.
    Do not use Textile for spam, harassment, scraping, unlawful surveillance, or bypassing permissions, safety measures,
    or rate limits. Do not use Discord message content to train AI models without Discord's express permission. Choose
    AI providers and settings that respect these restrictions.
  </p>

  <h2>Your content and privacy</h2>
  <p>
    Content remains owned by its existing rights holders. You permit us to process it only as needed to provide your
    requested service. These terms do not grant ownership of Discord content or permission to reuse someone else's work.
    Our <a href="/privacy">privacy policy</a> explains the data we process and how to request deletion.
  </p>
  <p>
    Your chosen MCP client or AI provider may store requests and results under its own terms. Changes made through
    Discord can persist there after you disconnect from Textile.
  </p>

  <h2>Availability and responsibility</h2>
  <p>
    The service is provided as available. We do not promise uninterrupted access, support for every Discord operation,
    or error-free results. Discord and your client can change or become unavailable independently. Review important
    actions before allowing an agent to perform them.
  </p>
  <p>
    To the extent permitted by law, we exclude implied warranties and liability for indirect or consequential losses.
    Nothing in these terms excludes liability that cannot legally be excluded, or limits your mandatory consumer rights.
  </p>

  <h2>Stopping access and changes</h2>
  <p>
    You can stop using Textile at any time. Revoke Textile under Discord's Authorised Apps settings and remove saved
    credentials from your client. Reset a bot token through Discord if you need to invalidate it. We may restrict or
    suspend access to address misuse, security risks, legal obligations, or operational problems. We may change or
    discontinue the service.
  </p>
  <p>
    We publish revised terms here with a new effective date. Material changes apply prospectively, with notice and any
    agreement required by law. Dutch law governs these terms without removing mandatory protections available where you
    live. This does not restrict your right to use a court available to you under applicable consumer law.
  </p>

  <h2>Contact</h2>
  <p>
    For support, security reports, abuse reports, or questions about these terms, email
    <a href="mailto:{email}">{email}</a>. Never include passwords or tokens.
  </p>
</LegalDocument>
