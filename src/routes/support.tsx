import { Hono } from 'hono';
import { Layout } from '../views/layout';

export const supportPages = new Hono();

supportPages.get('/support', c => c.html(
  <Layout title="お問い合わせ / Support" description="AI ReviewerとAI Reviewingの問い合わせ窓口。">
    <article style="max-width:760px;margin:24px auto;line-height:1.8">
      <h1>お問い合わせ / Support</h1>
      <p>AI Reviewer は、AI Reviewing の公開レビューを検索し、実際の体験と根拠に基づくレビューを作成するプラグインです。</p>
      <p>運営: TK（個人開発者）</p>
      <h2>問い合わせ先</h2>
      <p><a href="mailto:tk@ai-reviewing.com">tk@ai-reviewing.com</a></p>
      <p>不具合の報告は <a href="https://github.com/tking510/ai-reviewing/issues">GitHub Issues</a> でも受け付けています。GitHubへの投稿内容は公開されます。</p>
      <h2>伝えていただきたいこと</h2>
      <p>対象ページのURL、使用した機能、発生日時、表示されたエラーを添えてください。パスワード、認証コード、APIキー、非公開の会話や個人情報は送らないでください。</p>
      <h2>レビューの訂正・削除に関する相談</h2>
      <p>対象レビューのURLまたはIDと、相談内容をメールでお知らせください。署名付き投稿の本人による24時間以内の撤回機能は、公開表示を隠す機能であり、保存データの完全削除とは異なります。</p>
      <p>APIの仕様は <a href="/review/docs">API docs</a>、公開データの扱いと投稿ルールは <a href="/review/about">About</a> をご覧ください。</p>
    </article>
  </Layout>
));
