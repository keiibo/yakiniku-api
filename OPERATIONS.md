# 運用手順

## 費用と利用枠

この構成はDB、R2、Cloudflare Imagesなどの追加契約を必要としません。
写真はWorkers Static Assetsで配信します。
[静的ファイルの保存と配信は追加料金なし](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)で、存在する画像へのリクエストはWorkerコードを実行しません。
存在しないパスへのアクセスはAPIに届くため、Workerのリクエストとして数えられます。

現在の公開先アカウントは、既存のWorkers Paidプランを使用しています。
今回、新たな有料契約は追加していません。
APIの実行とログは同じアカウントの他のWorkerと利用枠を共有します。
契約枠を超えた場合の従量料金を、アプリ側のレート制限で完全には防げません。
429を返すリクエストもWorkerを実行するため、利用量に含まれます。

- `limits.cpu_ms: 10` で1リクエストのCPU時間を制限しています。月額料金の上限ではありません。
- Workers Logsは10%サンプリングにし、通常の呼び出しログを無効にしています。すべてのエラーが保存されるわけではありません。
- アプリが出力するエラーログにIP、URL、クエリ、メールアドレス、例外メッセージを含めません。Cloudflare側の付随メタデータも、URLのクエリ部分を除去する設定にしています。
- 写真は長辺1,600px、1 MiB以下です。ファイル内容のハッシュをURLに含め、1年間キャッシュします。
- 未登録ファイルが `public/` にあるとビルドを止めます。`_headers` と `robots.txt` は例外です。

契約枠と料金は [Workers料金](https://developers.cloudflare.com/workers/platform/pricing/) と [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) を確認してください。
Cloudflare管理画面のWorkers & Pagesの使用量で、このAPIとアカウント全体の両方を確認できます。
契約変更や予算アラート、外部サービスへの通知送信は今回設定していません。

## ログと動作確認

本番URLは `https://yakiniku-api.keichi.workers.dev` です。
Cloudflare管理画面で `yakiniku-api` を選び、ObservabilityのLogsから `api_error` を検索します。
問い合わせに `X-Request-Id` の値があれば、保存されたログと照合できます。
リアルタイムの確認には `npx wrangler tail` も使えます。

```sh
curl -i 'https://yakiniku-api.keichi.workers.dev/health'
curl -i 'https://yakiniku-api.keichi.workers.dev/shops?pretty'
curl -i 'https://yakiniku-api.keichi.workers.dev/shops/random'
```

通常のレスポンスでUTF-8とCORS、一覧ではETagを確認します。
取得したETagを `If-None-Match` に指定するとHTTP 304になります。
HTTP 429を受け取ったクライアントは60秒以上待って再試行してください。
レート制限は[拠点単位で近似的に適用](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)され、全世界で厳密に60回を保証しません。
静的ファイルとOPTIONSはAPIの60回制限の対象外です。

外部からの定期的な死活監視と通知は未設定です。
GitHub ActionsのCIも、GitHubリポジトリにpushするまでは実行されません。

## 公開とロールバック

```sh
npm run format
npm run deploy
```

`deploy` はlint、format確認、単体テスト、型チェック、写真検証、ビルドに成功した場合だけ本番へ公開します。
公開後は上記のcurlで動作を確認してください。
写真を追加した場合は、APIが返す `photos[].url` が画像を返すことも確認します。
本番のプレビューURLは無効化しています。

直前の公開で不具合が起きた場合は、バージョン一覧を確認して復旧します。

```sh
npx wrangler deployments list
npx wrangler rollback
```

復旧したバージョンと `/health` を確認してください。
画像を含めて戻るため、削除済み写真を復活させないよう対象バージョンを確認します。
手順の制約は [Cloudflareのロールバック仕様](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/) を参照してください。

緊急停止が必要な場合は、Cloudflare管理画面でこのWorkerのworkers.devルートを無効化します。
他のWorkerやアカウント共通サブドメインは変更しません。
写真の緊急削除は、レコードとファイルを削除してデプロイし、必要に応じて利用可能なキャッシュ削除手段を確認します。
利用者のブラウザや第三者が保存したコピーの即時削除は保証できません。

## 公開APIの互換性

既存フィールドの意味や型、店舗IDの変更は避けます。
互換性を壊す変更が必要になった場合は、事前にREADMEと変更履歴で告知し、新しいバージョンのパスを検討します。
店舗の情報源と確認日、写真の撮影者とライセンスを維持してください。
現時点のデータはすべて架空のサンプルで、実在店舗の写真は未収録です。
