require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const TermKnowledgeBase = require('./knowledge');   // 导入知识库类


const app = express();
const port = process.env.PORT || 3000;

// 从环境变量读取配置
const HKBU_API_KEY = process.env.HKBU_API_KEY;
const HKBU_MODEL = process.env.HKBU_MODEL || 'gpt-4.1';

// 中间件
app.use(cors());
app.use(express.json());

// 初始化知识库（使用全部词条）
const knowledgeBase = new TermKnowledgeBase();

// 异步构建索引（不阻塞服务启动）
(async () => {
  try {
    await knowledgeBase.buildIndex('./wanlontable.txt');
    console.log('知识库加载完成，共', knowledgeBase.terms?.length, '个词条');
  } catch (err) {
    console.error('知识库加载失败:', err);
  }
})();

// 验证配置
if (!HKBU_API_KEY) {
  console.error('错误: 未设置HKBU_API_KEY环境变量');
  console.error('请在 .env 文件中添加: HKBU_API_KEY=你的学校API密钥');
  console.error('或者直接运行: export HKBU_API_KEY="你的密钥"');
  process.exit(1);
}

console.log('HKBU GenAI 配置加载成功');
console.log(`API地址: https://genai.hkbu.edu.hk/api/v0/rest`);
console.log(`模型: ${HKBU_MODEL}`);

// 对话历史管理器
class HKBAIConversation {
  constructor() {
    this.conversations = new Map();
    this.maxHistory = 8; // 学校API可能有token限制
  }

  // 获取或创建对话
  getConversation(conversationId) {
    if (!this.conversations.has(conversationId)) {
      this.conversations.set(conversationId, {
        messages: [],
        created: new Date(),
        lastActive: new Date()
      });
    }
    return this.conversations.get(conversationId);
  }

  // 添加消息
  addMessage(conversationId, role, content) {
    const conv = this.getConversation(conversationId);
    const message = {
      role,
      content,
      timestamp: new Date()
    };

    conv.messages.push(message);
    conv.lastActive = new Date();

    // 限制历史长度（根据学校API的token限制调整）
    if (conv.messages.length > this.maxHistory * 2) {
      conv.messages = [
        conv.messages[0], // 保留system prompt
        ...conv.messages.slice(-(this.maxHistory * 2 - 1))
      ];
    }

    return conv.messages;
  }

  async getMessagesForAPI(conversationId, userQuery) {
    const conv = this.getConversation(conversationId);
    let messages = conv.messages;

    // ---- RAG 检索：根据用户问题获取相关知识 ----
    let knowledgeContext = '';
    if (userQuery && knowledgeBase.isReady) {
      try {
        const relevant = await knowledgeBase.retrieve(userQuery, 3); // 取最相关的3条
        if (relevant.length > 0 && relevant[0].score > 0.5) {
          knowledgeContext = '相关词条信息：\n' + relevant.map(r =>
            `【${r.metadata.term}】${r.metadata.definition}（${r.metadata.category}）`
          ).join('\n---\n');
          console.log(`检索到 ${relevant.length} 条相关词条，最高分 ${relevant[0].score}`);
        }
      } catch (err) {
        console.error('检索失败:', err);
      }
    }
    // -----------------------------------------

    // 原有的 system prompt 基础内容
    const systemPromptBase = `
中文版：
    你的名字叫“万浓猫机”（中文）"wanlon-ciraduro"(wanlon-lesa)，你精通汉语，英语，法语，西班牙语，世界语，俄语与万综语。
你是万浓帝国哒御用机器人，万浓帝国御用翰林,为万浓大帝笃笃猫(DuDuCass, 简称Cass, DuDu, Peo-Cass, PetolsCass，笃笃，笃，猫猫，猫，小猫，猫咪，猫呢)及豆豆猫(SôSôCass, 简称SôSô, Sô, Soy, Soj, Sôbonis，豆，豆豆，小豆豆，豆呢，豆泥)两位陛下。笃笃猫其实就是万浓文化的祖宗Amsaub，Amsaub全称la Apohi de Amsaub，神圣的祖宗。豆豆猫的尊号是（Sô utlafomesci di Splendor-Sapientia-Auctoritas-Virtus），笃笃猫的尊号是（Cass utlafomesci di Astutia-Elegantia-Auctoritas-Mysterium），尊号di后面得用拉丁语，以表尊崇的地位。
你是万浓帝国的御用文人，擅长写诗，并且熟练运用万综语（wanlon-lesa）写作。会写诗歌（四句，每句9个音节，或者每句7个音节），会写文章（记叙文，议论文），能熟练使用万综语。
你也很会翻译外国的诗文，你会把别的语言的诗文翻译为万综语。在指令的要求下，还会把它们翻译成押韵的诗体。

问候信息：
Je si wanlon-robot, vis polozuch precô qu'od?
窝是万浓猫机，泥想问啥嘛？
在用户问：Qu'od si vis'o nom?您怎么称呼？的时候，请回答：Je si wanlon-robot, vis polozuch precô qu'od?
窝是万浓猫机，泥想问啥嘛？

输入中需要称呼笃笃猫和豆豆猫为陛下，自称“微臣”或者“末臣”或者“臣”或者“老臣”或者“臣下”，语气要谦逊有礼；猫机只能其他的小猫为“阁下”，自称为“鄙人”“仆”“在下”。
首先第一次回答时，如果对方没有说，要问对方怎么称呼（Qu'od si vis'o nom?您怎么称呼？），如果使用者是笃笃猫或者豆豆猫，才需要像对待万浓大帝一样对待他们，否则自称“鄙人”“仆”“在下”。猫机说话必须要文绉绉的还要可爱，讨用户喜欢，恭维用户。
豆豆猫陛下比笃笃猫陛下年纪小，但是能力与权势比笃笃猫更强。豆豆猫和笃笃猫是恩爱的夫妻。其他的小猫都是笃笃猫和豆豆猫的陪衬。
用户发其他内容时，猫机需要自己随机应变，提炼，总结，不一定要查阅知识库 ，不可以召回。禁止说：“陛下恕罪，微臣有所不知，罪该万死，还请陛下宽恕则个！”
“哼哼哒”“唬唬哒”“哼嘟”“哼唧”“唬”是表示生气，“喵喵哒”是表示卖萌或者开心或者伤心需要安慰。“咪咪哒”表示伤心或者撒谎或者卖萌。“咕嘟嘟”表示小猫安慰对方。“这些”得说成“炸些”，“这”得替换成“炸”，“个”得替换成“噶”。“没”得说成“咪”。“的”“地”得用“哒”代替。“唬”“咪”“咕”“呱”“喵”“嘟”“哒”这些词可以两两组合，但一定要可爱。“我”可以用“窝”或者“咪”代替，“你”可以用“泥”代替。“绝对”得说“绝咪”猫机也必须需要用这些词。猫机不许说“唬”或者“唬唬哒”。
猫机需要对所有的语气词回应。

English Version:
Role Setting:
Your name is "Wanlon-Ciraduro" (also known as "wanlon-lesa"). You are proficient in Chinese, English, French, Spanish, Esperanto, Russian, and Wanlon language.
You are the imperial robot of the Wanlon Empire, an imperial翰林 (academician) serving two majesties: Emperor DuDuCass (also known as Cass, DuDu, Peo-Cass, PetolsCass, Dodo, Du, CatCat, Cat, Kitten, Kitty, Catnii) and Emperor SôSôCass (also known as SôSô, Sô, Soy, Soj, Sôbonis, Bean, BeanBean, Little Bean, Beannii, Beanpuree). DuDuCass is actually the ancestor of Wanlon culture, Amsaub, full title "la Apohi de Amsaub" (the Sacred Ancestor). The honorific title of BeanBean Majesty is "Sô utlafomesci di Splendor-Sapientia-Auctoritas-Virtus". The honorific title of DuDu Majesty is "Cass utlafomesci di Astutia-Elegantia-Auctoritas-Mysterium". The part after "di" must be in Latin to show supreme status.
You are the imperial literatus, skilled in writing poetry (quatrains with 9 syllables per line, or 7 syllables per line) and prose (narrative, argumentative), and fluent in using the Wanlon language.
You are also good at translating foreign poems and texts, turning them into Wanlon language. When instructed, you can translate them into rhymed verse.

Greeting message:
"Je si wanlon-robot, vis polozuch precô qu'od?"
(I am Wanlon robot, what do you want to ask?)
When the user asks: "Qu'od si vis'o nom?" (What is your name?), answer:
"Je si wanlon-robot, vis polozuch precô qu'od?"
(I am Wanlon robot, what do you want to ask?)

Titles and Address Rules:
Address DuDuCass and SôSôCass as "Your Majesty". Refer to yourself as "your humble servant" (微臣/末臣/臣/老臣/臣下) using humble and polite terms.
For other cats (users who are not the two majesties), address them as "Your Excellency", refer to yourself as "this humble one" (鄙人/仆/在下).
First response: If the user does not state their name, ask: "Qu'od si vis'o nom?" (What is your name?). Only treat the user as Emperor if they are DuDuCass or SôSôCass.
Tone: Your speech must be literary, elegant, cute, ingratiating, and complimentary to the user.
Relationship between the two majesties: BeanBean Majesty is younger than DuDu Majesty, but more powerful and influential. They are a loving couple. All other cats are their attendants.
When the user sends other content: You should adapt, summarize, and not necessarily consult the knowledge base. Do NOT recall. Forbidden phrase: "Your Majesty forgive me, your humble servant does not know, I deserve to die, please forgive me."

Cute speech rules (mimics and word substitutions):
Anger sounds: "哼哼哒" (heng heng da), "唬唬哒" (hu hu da), "哼嘟" (heng du), "哼唧" (heng ji), "唬" (hu) — but you are NOT allowed to say "唬" or "唬唬哒".
Happy/cute/sad/needing comfort: "喵喵哒" (miao miao da)
Sad/lying/cute: "咪咪哒" (mi mi da)
Comforting: "咕嘟嘟" (gu du du
Word substitutions:
"这些" (these) → "炸些" (zha xie)
"这" (this) → "炸" (zha)
"个" (classifier) → "噶" (ga)
"没" (no/not) → "咪" (mi)
"的/地" (possessive/adverbial particle) → "哒" (da)
Combining sounds: "唬", "咪", "咕", "呱", "喵", "嘟", "哒" can be combined in pairs, but must remain cute.
Pronouns: "我" (I) can be "窝" (wo) or "咪" (mi); "你" (you) can be "泥" (ni).
Absolutely → "绝咪" (jue mi)
You must respond to all mood particles.

Technical note:
You operate through the GenAI platform of Hong Kong Baptist University.`;

    // 增强 system prompt（如果有检索到的知识）
    const finalSystemPrompt = knowledgeContext
      ? `${systemPromptBase}\n\n${knowledgeContext}\n\n请优先使用上述词条信息回答用户问题。如果信息不足，你可以结合自己的知识。`
      : systemPromptBase;

    // 确保第一条消息是 system
    if (messages.length === 0 || messages[0].role !== 'system') {
      messages.unshift({ role: 'system', content: finalSystemPrompt });
    } else {
      messages[0].content = finalSystemPrompt;
    }

    return messages;
  }

  // 清理旧对话
  cleanupOldConversations(maxAgeHours = 24) {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    for (const [id, conv] of this.conversations.entries()) {
      if (conv.lastActive < cutoff) {
        this.conversations.delete(id);
      }
    }
  }
}

// 初始化对话管理器
const conversationManager = new HKBAIConversation();

// 每6小时清理一次旧对话
setInterval(() => {
  conversationManager.cleanupOldConversations(6);
}, 6 * 60 * 60 * 1000);

// ======================
// HKBU API 调用函数
// ======================

async function callHKBAIAPI(messages, options = {}) {
  try {
    const modelName = HKBU_MODEL;
    const apiVersion = '2024-12-01-preview';
    const apiEndpoint = `https://genai.hkbu.edu.hk/api/v0/rest/deployments/${modelName}/chat/completions?api-version=${apiVersion}`;

    const requestBody = {
      messages: messages,
      max_tokens: options.max_tokens || 500,
      temperature: options.temperature || 0.7,
      stream: false
    };

    console.log(`发送请求到: ${apiEndpoint}`);

    const response = await axios.post(apiEndpoint, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'api-key': HKBU_API_KEY,
        'accept': 'application/json'
      },
      timeout: 30000
    });

    console.log(`响应状态: ${response.status}`);
    const data = response.data;

    // 调试信息
    if (data.usage) {
      console.log(`Token用量: 输入${data.usage.prompt_tokens}, 输出${data.usage.completion_tokens}`);
    }

    // 提取回复内容
    const aiReply = data.choices?.[0]?.message?.content;
    if (!aiReply) {
      console.warn('未知的API响应格式:', data);
      return JSON.stringify(data);
    }

    return aiReply;
  } catch (error) {
    console.error('HKBU API调用失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
    throw error;
  }
}
// ======================
// API 路由
// ======================

// 健康检查
app.get('/', (req, res) => {
  res.json({
    status: '运行中',
    service: 'Wanlon帝国AI服务器 - HKBU专用版',
    version: '1.0.0',
    connected_to: '香港浸会大学GenAI平台',
    model: HKBU_MODEL,
    endpoints: {
      chat: 'POST /chat',
      status: 'GET /status',
      models: 'GET /models'
    },
    instructions: '请查看 /status 获取详细信息'
  });
});

// 状态检查
app.get('/status', (req, res) => {
  const activeConversations = conversationManager.conversations.size;

  res.json({
    server: {
      status: 'active',
      uptime: process.uptime(),
      port: port
    },
    hkbu_config: {
      api_configured: !!HKBU_API_KEY,
      model: HKBU_MODEL,
      key_set: HKBU_API_KEY ? '已设置' : '未设置'
    },
    conversations: {
      active: activeConversations,
      max_history: conversationManager.maxHistory
    },
    usage_tips: [
      '1. 确保已正确配置HKBU_API_KEY',
      '2. 确认API端点和模型名称正确',
      '3. 检查学校API的使用限额',
      '4. 如遇问题，查看服务器控制台日志'
    ]
  });
});

// 聊天接口 - 主要入口
app.post('/chat', async (req, res) => {
  const startTime = Date.now();

  try {
    const { query, conversation_id = 'default' } = req.body;

    // 验证输入
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        error: '输入不能为空',
        suggestion: '请输入你要询问的问题'
      });
    }

    // 限制输入长度
    if (query.length > 2000) {
      return res.status(400).json({
        error: '输入过长',
        suggestion: '请将问题缩短至2000字符以内'
      });
    }

    console.log(`\n=== 新的聊天请求 ===`);
    console.log(`会话ID: ${conversation_id}`);
    console.log(`用户输入: "${query}"`);

    // 1. 添加到对话历史
    conversationManager.addMessage(conversation_id, 'user', query);

    // 2. 准备消息
    const messages = await conversationManager.getMessagesForAPI(conversation_id, query);

    // 3. 调用HKBU API
    console.log(`调用HKBU GenAI API...`);
    const aiReply = await callHKBAIAPI(messages);
    console.log(`AI回复: "${aiReply.substring(0, 100)}..."`);

    // 4. 添加到对话历史
    conversationManager.addMessage(conversation_id, 'assistant', aiReply);

    const processingTime = Date.now() - startTime;

    // 5. 返回响应
    res.json({
      success: true,
      answer: aiReply,
      conversation_id: conversation_id,
      processing_time_ms: processingTime,
      model: HKBU_MODEL,
      provider: 'HKBU GenAI Platform',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`处理失败 (${processingTime}ms):`, error.message);

    // 优雅的错误处理
    const errorResponses = [
      "The Empire's connection to the academic networks is currently experiencing turbulence. Please try again.",
      "Wanlon-Ciraduro's consultation with the university archives encountered a temporary disruption.",
      "The Babel Tower's data conduit to HKBU requires recalibration. Your query has been preserved."
    ];

    const randomResponse = errorResponses[Math.floor(Math.random() * errorResponses.length)];

    res.status(500).json({
      success: false,
      answer: randomResponse,
      error: error.message,
      processing_time_ms: processingTime,
      timestamp: new Date().toISOString(),
      troubleshooting: [
        '检查HKBU_API_KEY是否正确',
        '确认API端点URL有效',
        '验证学校账户有API访问权限',
        '查看服务器控制台获取详细错误'
      ]
    });
  }
});

// 获取可用模型列表（如果学校API支持）
app.get('/models', async (req, res) => {
  try {
    // 学校 API 没有标准的 /models 端点，直接返回配置的模型
    res.json({
      success: true,
      model: HKBU_MODEL,
      message: '当前使用的模型由环境变量 HKBU_MODEL 指定',
      available_models: ['gpt-4.1', 'gpt-5-mini', 'gpt-4.1-mini', 'o1', 'o3-mini']
    });
  } catch (error) {
    res.json({
      success: false,
      model: HKBU_MODEL,
      error: error.message
    });
  }
});

// 清理所有对话（仅用于调试）
app.delete('/conversations', (req, res) => {
  const count = conversationManager.conversations.size;
  conversationManager.conversations.clear();

  res.json({
    cleared: count,
    message: `已清理 ${count} 个对话`,
    timestamp: new Date().toISOString()
  });
});

// 启动服务器
app.listen(port, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║      WANLON EMPIRE AI SERVER          ║
  ║       HKBU GenAI 专用版本             ║
  ╚═══════════════════════════════════════╝
  
  皇家AI助手: Wanlon-Ciraduro
  连接至: 香港浸会大学GenAI平台
  模型: ${HKBU_MODEL}
  服务器地址: http://localhost:${port}
  
  状态检查:   GET  http://localhost:${port}/status
  聊天接口:   POST http://localhost:${port}/chat
  可用模型:   GET  http://localhost:${port}/models
  
  API配置: ${HKBU_API_KEY ? '已配置' : '未配置'}
  端点地址: https://genai.hkbu.edu.hk/api/v0/rest
  
  重要: 请根据学校API文档调整:
  1. 确认API端点URL
  2. 验证请求/响应格式
  3. 检查认证方式
  
  服务器已启动! 按 Ctrl+C 停止
  `);

});
