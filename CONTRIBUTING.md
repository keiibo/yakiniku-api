# 投稿と開発への参加

店舗の追加、情報の訂正、不具合修正をPull Requestで受け付けます。

## 店舗を追加する

1. リポジトリをForkしてcloneします。
2. `npm ci` で開発環境を準備します。
3. `content/shops.json` の配列に店舗を追加します。
4. `npm run format` と `npm run check` を実行します。
5. 情報源と変更内容を説明してPull Requestを作成します。

既存レコードを複製して編集できます。
`id` は英小文字、数字、単語の間のハイフンで構成し、既存IDと重複しない値にしてください。
`random` はAPIの予約語なので店舗IDには使えません。
IDはAPIのURLに使うため、公開後は変更を避けてください。

実在店舗には `isSample: false`、公式サイトなどの `sourceUrl`、確認日の `checkedAt`（YYYY-MM-DD）を指定します。
`website` は任意です。
URLはHTTPS、都道府県は正式名称で記入してください。
説明文は自身の言葉で書き、第三者の紹介文を転載しないでください。
営業時間や価格など、確認していない情報を推測で埋めないでください。

`specialtyCuts` は確認できた提供部位、`tags` は店舗の特徴です。
情報がなければ空配列にできます。
タグは `wagyu`（和牛）、`horumon`（ホルモン）、`charcoal`（炭火）、`all-you-can-eat`（食べ放題）から選びます。

## 写真を追加する

初版では、利用権限のあるHTTPS画像URLを登録します。
画像の保存やアップロード機能はありません。
写真がなくても `photos: []` で投稿できます。

撮影者本人の写真、またはCC BY 4.0で提供する許可を得た写真を使ってください。
写真を追加する場合は `content/authors.json` に投稿者を登録します。

```json
{
  "id": "your-name",
  "name": "表示名",
  "url": "https://example.com/profile"
}
```

店舗の `photos` に次の形で追加します。

```json
{
  "url": "https://example.com/your-photo.jpg",
  "authorId": "your-name",
  "alt": "網の上で焼くカルビ",
  "width": 1200,
  "height": 800,
  "license": "CC-BY-4.0"
}
```

本人の許可のない顔や個人情報が写っていないか確認し、位置情報などのExifを削除してください。
画像URLの公開権限と継続的な利用可否も確認してください。

投稿データと写真はCC BY 4.0、コードはMITで提供します。
実在店舗の事実確認と画像の権利確認は投稿者とレビュアーが行います。
自動テストは形式、ID重複、投稿者への参照を検証します。

## コードを変更する

関数には目的を示すJSDocを付け、新規関数と挙動の変更には対応するテストを追加してください。
`npm run format` と `npm run check` が通る状態で提出します。
APIの互換性が変わる場合はREADMEの利用例も更新してください。
