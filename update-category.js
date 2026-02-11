const { Amplify } = require('aws-amplify');
const { generateClient } = require('aws-amplify/api');
const config = require('./src/aws-exports.js').default;

Amplify.configure(config);
const client = generateClient();

const wordUpdates = [
  { id: "1", category_ids: [10, 160], status: 0 },
  { id: "2", category_ids: [30, 160], status: 0 },
  { id: "3", category_ids: [10], status: 0 },
  { id: "4", category_ids: [10, 20, 90], status: 0 },
  { id: "5", category_ids: [10], status: 0 },
  { id: "6", category_ids: [10], status: 0 },
  { id: "7", category_ids: [10], status: 0 }
];

async function runUpdate() {
  const updateWordMutation = `
    mutation UpdateWord($input: UpdateWordInput!) {
      updateWord(input: $input) { 
        id 
        word 
        category_ids 
        status 
      }
    }
  `;

  console.log('再試行を開始します...');

  for (const item of wordUpdates) {
    try {
      const result = await client.graphql({
        query: updateWordMutation,
        variables: { input: item }
      });
      console.log(`成功: ID ${item.id} (${result.data.updateWord.word})`);
    } catch (e) {
      console.error(`エラー ID ${item.id}:`, JSON.stringify(e, null, 2));
    }
  }
  console.log('処理が終了しました。');
}

runUpdate();