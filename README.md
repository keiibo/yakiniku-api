# Yakiniku API 🥩

焼肉店の情報を取得できる、OSSのWeb APIです。
[Ramen API](https://github.com/yusukebe/ramen-api) の「APIを使って試せる」「データの追加でも参加できる」という構成に着想を得て、新規に実装しています。

初版はREST APIです。
**収録済みの3店舗はすべて架空のサンプルです。**
店舗ごとの `isSample` で区別でき、`isSample=false` で実在店舗だけに絞れます。
現時点では実在店舗と写真は未収録です。

## 公開API

Cloudflare Workersで公開しています。

- ベースURL：https://yakiniku-api.keichi.workers.dev
- [店舗一覧](https://yakiniku-api.keichi.workers.dev/shops?pretty)
- [ランダム取得](https://yakiniku-api.keichi.workers.dev/shops/random?pretty)

```sh
curl 'https://yakiniku-api.keichi.workers.dev/shops?pretty'
```

## 店舗と写真を投稿する

次のフォームから、写真付きで投稿できます。

- [店舗と写真を投稿する](https://github.com/keiibo/yakiniku-api/issues/new?template=01-shop.yml)
- [既存店舗に写真を追加する](https://github.com/keiibo/yakiniku-api/issues/new?template=02-photo.yml)
- [訂正や削除依頼、不具合を報告する](https://github.com/keiibo/yakiniku-api/issues/new?template=03-correction.yml)

「店舗と写真を投稿する」または「既存店舗に写真を追加する」を選び、フォームの写真欄へ画像を添付してください。
GitHubアカウントがあれば参加でき、開発環境の準備は不要です。
新しい店舗の投稿にも、ご自身で撮影した写真を1枚以上添えてください。

写真付きIssueを管理者が確認し、PRのレビューを経てAPIに反映します。
写真には撮影者の公開名を記録します。メールアドレスの入力は不要です。
[写真付き投稿の手順](CONTRIBUTING.md#写真付きで投稿する)と[PRでの参加方法](CONTRIBUTING.md#pull-requestで参加する)を用意しています。

## 起動

Node.js 22系（22.12以降）とnpmを推奨します。
Cloudflareへのログインなしでローカル開発できます。

```sh
npm ci
npm run dev
```

```sh
curl 'http://localhost:8787/shops?pretty'
curl 'http://localhost:8787/shops/sample-sumibi'
curl --get 'http://localhost:8787/shops' --data-urlencode 'q=ハラミ'
curl 'http://localhost:8787/shops/random?tag=horumon'
```

```js
const response = await fetch('http://localhost:8787/shops/sample-sumibi')
if (!response.ok) throw new Error(`HTTP ${response.status}`)
const { shop } = await response.json()
console.log(shop.name) // サンプル焼肉 炭火
```

## エンドポイント

認証不要の読み取り専用APIです。
ブラウザからの呼び出しにはCORSで対応しています。

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | `/` | APIの概要とライセンス |
| GET | `/health` | ヘルスチェック |
| GET | `/shops` | 店舗一覧、検索、ページ分割 |
| GET | `/shops/random` | 条件に合う店舗をランダムに1件取得 |
| GET | `/shops/:shopId` | 店舗詳細 |
| GET | `/authors/:authorId` | 写真の投稿者情報 |

### 一覧とランダム取得の検索条件

複数条件はANDで結合します。
一覧はIDの昇順で返します。

| パラメーター | 内容 |
| --- | --- |
| `q` | 店名、市区町村、説明、部位の部分一致。1〜100文字。全角と半角を正規化 |
| `prefecture` | 都道府県の正式名称。例：`東京都` |
| `tag` | `wagyu`、`horumon`、`charcoal`、`all-you-can-eat` のいずれか |
| `isSample` | `true` でサンプルのみ、`false` で実在店舗のみ。省略時は両方 |
| `page` | 一覧のみ。1以上の整数。既定値は1 |
| `perPage` | 一覧のみ。1〜100の整数。既定値は10 |
| `pretty` | JSONを整形。全エンドポイントで使用可能 |

未定義の検索パラメーターと不正な値はHTTP 400になります。
ランダム取得の結果はキャッシュしません。

### 一覧レスポンス

`GET /shops?perPage=1` の例です。

```json
{
  "shops": [
    {
      "id": "sample-horumon",
      "name": "サンプル焼肉 ホルモン",
      "prefecture": "大阪府",
      "city": "サンプル市",
      "description": "開発用の架空店舗です。ホルモンの検索例に使えます。",
      "specialtyCuts": ["シマチョウ", "ミノ"],
      "tags": ["horumon"],
      "checkedAt": "2026-10-20",
      "isSample": true,
      "photos": []
    }
  ],
  "totalCount": 3,
  "pageInfo": {
    "currentPage": 1,
    "perPage": 1,
    "lastPage": 3,
    "nextPage": 2,
    "prevPage": null
  }
}
```

詳細とランダム取得は `{ "shop": { ... } }`、投稿者は `{ "author": { ... } }` を返します。
検索結果が0件の場合、一覧はHTTP 200と空配列、ランダム取得はHTTP 404を返します。
0件の `lastPage` は1です。
最終ページを超えた一覧もHTTP 200と空配列になり、`prevPage` は最終ページを指します。

### エラー

HTTP 400（検索条件が不正）、404（対象なし）、429（アクセス制限）、500（内部エラー）を使います。
検証エラーには対象の `field` も付きます。

```json
{ "errors": [{ "message": "Shop not found." }] }
```

## 公開時の運用設定

- APIは接続元IPごとに60秒間で60リクエストを目安に制限し、超過時はHTTP 429と `Retry-After: 60` を返します。
- 制限はCloudflare拠点単位の近似値です。同じ回線の利用者は枠を共有します。
- 一覧と詳細などの固定レスポンスは60秒キャッシュし、ETagによるHTTP 304に対応します。
- ランダム取得、ヘルスチェック、エラーレスポンスはキャッシュしません。
- 内部エラーはリクエストIDと固定のエラーコードで記録し、保存対象を10%にサンプリングします。
- 写真はWorkersの静的ファイルとして配信し、R2やCloudflare Imagesは使用しません。

利用制限と費用、ログの確認、ロールバックは [OPERATIONS.md](OPERATIONS.md) に記載しています。

## 開発

Hono、TypeScript、Zod、Cloudflare Workersで構成しています。
データはJSONとして管理し、DBなしで動作します。

```sh
npm run format
npm run check
```

`check` はlint、format確認、単体テスト、型チェック、Workersのビルドを実行します。
GitHub ActionsでもpushとPull Requestに対して同じ検証を実行します。
`build` は `dist/` に成果物を作るdry runで、外部には公開しません。

| パス | 役割 |
| --- | --- |
| `src/index.ts` | HTTPルーティング |
| `src/catalog.ts` | 投稿データの型、検証、読み込み |
| `src/search.ts` | 検索とページ分割 |
| `content/shops.json` | 店舗データ |
| `content/authors.json` | 写真の投稿者 |
| `test/` | API、検索、投稿データのテスト |

## 投稿と公開

店舗情報の追加手順は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。
実在店舗には情報源URLと確認日を必須とし、写真には投稿者とライセンスを記録します。

Cloudflare Workersに公開する場合は、アカウントを用意して次を実行します。

```sh
npx wrangler login
npm run deploy
```

公開前に `wrangler.jsonc` のサービス名と公開対象データを確認してください。
このリポジトリの公開先は、上記のWorkers URLです。
写真ファイルは `npm run photo:add` で登録し、デプロイ時に公開します。
手順は [写真の登録方法](CONTRIBUTING.md#写真を追加する) を参照してください。
ブラウザからの投稿はGitHubのIssueフォームで受け付けます。
GraphQL、MCP、APIへの直接アップロードは未実装です。

## ライセンスと謝辞

ソースコードは [MIT](LICENSE)、投稿データは [CC BY 4.0](content/LICENSE.md) です。
写真を使う場合は各写真の `authorId` から投稿者名を取得してクレジットを表示してください。

着想元はYusuke Wada氏の [Ramen API](https://github.com/yusukebe/ramen-api) です。
元リポジトリのコード、店舗情報、写真は転用していません。
