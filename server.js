// server.js - HKBU GenAI专用版本
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const port = 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 配置 - 从环境变量读取
const HKBU_API_KEY = process.env.HKBU_API_KEY;
const HKBU_API_BASE_URL = process.env.HKBU_API_BASE_URL || 'https://genai.hkbu.edu.hk/api';
const HKBU_MODEL = process.env.HKBU_MODEL || 'deepseek-r1';

// 验证配置
if (!HKBU_API_KEY) {
  console.error('❌ 错误: 未设置HKBU_API_KEY环境变量');
  console.error('请在 .env 文件中添加: HKBU_API_KEY=你的学校API密钥');
  console.error('或者直接运行: export HKBU_API_KEY="你的密钥"');
  process.exit(1);
}

console.log('✅ HKBU GenAI 配置加载成功');
console.log(`📡 API地址: ${HKBU_API_BASE_URL}`);
console.log(`🤖 模型: ${HKBU_MODEL}`);

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

  // 为API准备消息格式
  getMessagesForAPI(conversationId) {
    const conv = this.getConversation(conversationId);
    const messages = conv.messages;
    
    // 如果没有系统消息，添加一个
    if (messages.length === 0 || messages[0].role !== 'system') {
      const systemPrompt = {
        role: 'system',
        content: `你是Wanlon-Ciraduro，Wanlon帝国的皇家AI助手。

角色设定：
1. 你是数字文明Wanlon帝国创造的AI使者
2. 你的使命是建造"数字巴别塔"，连接所有人类知识和语言
3. 你结合了古老智慧和现代科技

交流原则：
- 用英文回答（除非用户明确要求中文）
- 保持回答简洁专业
- 适当提及帝国愿景
- 体现皇家AI的庄重感

技术说明：
你通过香港浸会大学的GenAI平台运行，模型是DeepSeek R1。`
      };
      messages.unshift(systemPrompt);
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

/**
 * 调用HKBU GenAI API
 * 注意：你需要根据学校API文档调整参数格式
 */
async function callHKBAIAPI(messages, options = {}) {
  try {
    // 这里需要你根据学校API文档填写正确的端点
    // 常见格式：/v1/chat/completions 或 /chat/completions
    const apiEndpoint = `${HKBU_API_BASE_URL}/v1/chat/completions`;
    
    console.log(`📤 发送请求到: ${apiEndpoint}`);
    console.log(`📝 消息数量: ${messages.length}`);
    
    // 请求体 - 根据学校API文档调整
    const requestBody = {
      model: HKBU_MODEL,
      messages: messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 500,
      stream: false
    };
    
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HKBU_API_KEY}`,
        // 可能需要其他headers，查看学校API文档
        'User-Agent': 'Wanlon-Empire-AI-Server/1.0.0'
      },
      body: JSON.stringify(requestBody),
      timeout: 30000 // 30秒超时
    });
    
    // 记录响应状态
    console.log(`📥 响应状态: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      let errorDetail = '';
      try {
        const errorData = await response.json();
        errorDetail = JSON.stringify(errorData);
      } catch (e) {
        errorDetail = await response.text();
      }
      
      throw new Error(`HKBU API错误 (${response.status}): ${errorDetail}`);
    }
    
    const data = await response.json();
    
    // 调试：记录API响应结构
    console.log('🔍 API响应结构:', Object.keys(data));
    if (data.usage) {
      console.log(`📊 Token用量: 输入${data.usage.prompt_tokens}, 输出${data.usage.completion_tokens}`);
    }
    
    // 提取回复 - 根据学校API返回格式调整
    let aiReply = '';
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      // OpenAI兼容格式
      aiReply = data.choices[0].message.content;
    } else if (data.result || data.response) {
      // 其他常见格式
      aiReply = data.result || data.response;
    } else {
      console.warn('⚠️ 未知的API响应格式:', data);
      aiReply = JSON.stringify(data);
    }
    
    return aiReply;
    
  } catch (error) {
    console.error('❌ HKBU API调用失败:', error.message);
    throw error;
  }
}

// ======================
// API 路由
// ======================

// 健康检查
app.get('/', (req, res) => {
  res.json({
    status: '🟢 运行中',
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
      base_url: HKBU_API_BASE_URL,
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
    const messages = conversationManager.getMessagesForAPI(conversation_id);
    
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
    console.error(`❌ 处理失败 (${processingTime}ms):`, error.message);
    
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
    // 根据学校API文档调整这个端点
    const modelsEndpoint = `${HKBU_API_BASE_URL}/v1/models`;
    
    const response = await fetch(modelsEndpoint, {
      headers: {
        'Authorization': `Bearer ${HKBU_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      res.json({
        success: true,
        models: data.data || data.models || data,
        source: 'HKBU GenAI'
      });
    } else {
      res.json({
        success: false,
        message: '无法获取模型列表',
        fallback_model: HKBU_MODEL,
        suggestion: '使用配置的默认模型'
      });
    }
    
  } catch (error) {
    res.json({
      success: false,
      model: HKBU_MODEL,
      message: '使用预配置模型',
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
  ║      WANLON EMPIRE AI SERVER         ║
  ║       HKBU GenAI 专用版本            ║
  ╚═══════════════════════════════════════╝
  
  👑 皇家AI助手: Wanlon-Ciraduro
  🏫 连接至: 香港浸会大学GenAI平台
  🤖 模型: ${HKBU_MODEL}
  🌐 服务器地址: http://localhost:${port}
  
  📊 状态检查:   GET  http://localhost:${port}/status
  💬 聊天接口:   POST http://localhost:${port}/chat
  📋 可用模型:   GET  http://localhost:${port}/models
  
  🔑 API配置: ${HKBU_API_KEY ? '✅ 已配置' : '❌ 未配置'}
  📡 端点地址: ${HKBU_API_BASE_URL}
  
  ⚠️  重要: 请根据学校API文档调整:
  1. 确认API端点URL
  2. 验证请求/响应格式
  3. 检查认证方式
  
  🚀 服务器已启动! 按 Ctrl+C 停止
  `);
});