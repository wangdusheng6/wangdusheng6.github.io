const axios = require('axios');

const API_KEY = process.env.HKBU_API_KEY;
const EMBEDDING_URL = 'https://genai.hkbu.edu.hk/api/v0/rest/deployments/text-embedding-3-small/embeddings?api-version=2024-05-01-preview';

async function getEmbedding(text) {
    try {
        const response = await axios.post(EMBEDDING_URL, {
            input: text
        }, {
            headers: {
                'Content-Type': 'application/json',
                'api-key': API_KEY
            }
        });
        return response.data.data[0].embedding;
    } catch (error) {
        console.error('Embedding API 失败:', error.message);
        if (error.response) {
            console.error('状态码:', error.response.status);
            console.error('响应数据:', error.response.data);
        }
        throw error;
    }
}

module.exports = { getEmbedding };