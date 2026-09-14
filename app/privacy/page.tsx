export const metadata = {
  title: "プライバシーポリシー | 家計簿",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-bold">プライバシーポリシー</h1>

      <p>
        本アプリ「家計簿」は、個人が自身の家計管理のために開発・運用している非公開のWebアプリケーションです。開発者本人のみが利用しており、第三者へのサービス提供は行っていません。
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">取得する情報とGmail APIの利用目的</h2>
        <p>
          本アプリは、開発者自身のGmailアカウントに対してGoogle
          Gmail API（読み取り専用スコープ）を利用し、クレジットカード・デビットカードの利用通知メールのみを検索・取得します。取得した内容から利用日・金額・利用先を解析し、本アプリの取引記録として自動登録する目的にのみ使用します。
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">情報の保存・第三者提供</h2>
        <p>
          取得したデータは、開発者が管理するSupabase上のデータベースにのみ保存され、第三者への提供・販売・共有は一切行いません。メール本文そのものは保存せず、解析結果（日付・金額・利用先）のみを保存します。
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">お問い合わせ</h2>
        <p>本アプリに関するお問い合わせは、開発者本人まで直接ご連絡ください。</p>
      </section>
    </main>
  );
}
