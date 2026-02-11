import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = "Word-j5xrk73ytbbqzf4ocmr35jui44-dev";
const client = new DynamoDBClient({ region: "ap-northeast-1" }); // お使いのリージョンに合わせてください
const docClient = DynamoDBDocumentClient.from(client);

async function migrate() {
    // 1. 現在のテーブルを空にする（任意ですが、ゴミを残さないために推奨）
    console.log("Cleaning up old data...");
    const scanResult = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));
    for (const item of scanResult.Items || []) {
        await docClient.send(new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { id: item.id }
        }));
    }

    // 2. CSVを読み込んで投入
    console.log("Importing data from CSV...");
    const fileContent = fs.readFileSync('selected.csv', 'utf-8');
    const records = parse(fileContent, { columns: true, skip_empty_lines: true });

    for (const record of records) {
        const item = {
            ...record,
            word: record.term, // termの値をwordにコピー
            updatedAt: new Date().toISOString(),
            createdAt: record.createdAt || new Date().toISOString(),
        };
        delete item.term; // 古いterm属性を削除

        await docClient.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: item
        }));
        console.log(`Imported: ${item.word}`);
    }
    console.log("Migration completed!");
}

migrate().catch(console.error);