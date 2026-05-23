// knowledge.js - 加载术语表并构建向量索引
const fs = require('fs');
const readline = require('readline');
const { getEmbedding } = require('./embedding');

class TermKnowledgeBase {
    constructor() {
        this.terms = [];      // 存储 { text, metadata }
        this.vectors = [];    // 存储对应的向量
        this.isReady = false;
    }
    //在这里添加 saveCache 方法
    saveCache(cachePath = './vectors.cache.json') {
        const cache = {
            terms: this.terms,
            vectors: this.vectors,
            lastIndex: this.terms.length
        };
        fs.writeFileSync(cachePath, JSON.stringify(cache));
        console.log(`缓存已保存，当前进度: ${this.terms.length} 条`);
    }

    //在这里添加 loadCache 方法
    loadCache(cachePath = './vectors.cache.json') {
        if (fs.existsSync(cachePath)) {
            const cache = JSON.parse(fs.readFileSync(cachePath));
            this.terms = cache.terms;
            this.vectors = cache.vectors;
            this.isReady = true;
            console.log(`从缓存恢复，已有 ${this.terms.length} 条`);
            return this.terms.length;
        }
        return 0;
    }
    /**
     * 加载 TSV 文件并构建索引
     */
    async buildIndex(filePath) {
        // 1. 先尝试加载已有缓存，获取已处理的数量
        const doneCount = this.loadCache();
        // 2. 加载完整的词条列表（不限制）
        console.log(`加载术语表: ${filePath}`);
        const allTerms = await this.loadTSV(filePath);
        console.log(`总共 ${allTerms.length} 条有效词条`);
        // 3. 如果已经有部分处理过，则从 doneCount 继续
        if (doneCount > 0) {
            // 保留已处理的 terms 和 vectors，将剩余的词条追加到 this.terms
            const remainingTerms = allTerms.slice(doneCount);
            this.terms.push(...remainingTerms);
        } else {
            // 全新开始
            this.terms = allTerms;
            this.vectors = [];
        }
        console.log(`需要处理的词条: ${this.terms.length - doneCount} 条（从第 ${doneCount + 1} 条开始）`);
        console.log(`生成向量索引...`);
        // 4. 从 doneCount 开始循环处理
        for (let i = doneCount; i < this.terms.length; i++) {
            console.log(`正在处理第 ${i + 1}/${this.terms.length} 个词条: ${this.terms[i].metadata.term}`);
            try {
                const vector = await getEmbedding(this.terms[i].text);
                this.vectors.push(vector);
                // 每 100 条保存一次进度
                if ((i + 1) % 100 === 0) {
                    console.log(`已处理 ${i + 1}/${this.terms.length}`);
                    this.saveCache();   // 保存进度
                }
            } catch (err) {
                console.error(`词条 ${this.terms[i].metadata.term} 向量化失败`);
                this.vectors.push(null);
            }
        }
        // 5. 全部完成，最终保存一次
        this.isReady = true;
        this.saveCache();
        console.log(`索引构建完成，共 ${this.terms.length} 个词条`);
    }

    /**
     * 解析 TSV 文件
     */
    async loadTSV(filePath, limit = Infinity) {
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
        const items = [];
        let lineCount = 0;
        for await (const line of rl) {
            if (lineCount >= limit) break;
            if (!line.trim()) continue;
            const fields = line.split('\t');

            // 关键修改：只有术语和释义都存在才保留
            const term = fields[2]?.trim();
            const definition = fields[3]?.trim();
            if (!term || !definition) continue;

            items.push({
                text: `术语: ${term}\n释义: ${definition}\n类别: ${fields[7] || ''}`,
                metadata: {
                    term: term,
                    definition: definition,
                    category: fields[7] || '',
                    row: line
                }
            });
            lineCount++;
        }
        console.log(`加载了 ${items.length} 条有效词条（已过滤空术语/释义）`);
        return items;
    }

    /**
     * 余弦相似度计算
     */
    cosineSimilarity(vecA, vecB) {
        if (!vecA || !vecB) return 0;
        let dot = 0, magA = 0, magB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dot += vecA[i] * vecB[i];
            magA += vecA[i] * vecA[i];
            magB += vecB[i] * vecB[i];
        }
        if (magA === 0 || magB === 0) return 0;
        return dot / (Math.sqrt(magA) * Math.sqrt(magB));
    }

    /**
     * 检索最相关的词条
     */
    async retrieve(query, topK = 3) {
        if (!this.isReady) {
            throw new Error('知识库未就绪');
        }

        // 1. 向量化查询
        const queryVector = await getEmbedding(query);

        // 2. 计算相似度
        const similarities = this.vectors.map((vec, idx) => ({
            idx,
            score: this.cosineSimilarity(queryVector, vec),
            metadata: this.terms[idx].metadata
        }));

        // 3. 排序并取 Top-K
        similarities.sort((a, b) => b.score - a.score);
        return similarities.slice(0, topK);
    }
}

module.exports = TermKnowledgeBase;