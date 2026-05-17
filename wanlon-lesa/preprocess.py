import json
import re
from collections import defaultdict

def parse_wanlon_table(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.read().strip().split('\n')
    
    if not lines:
        return []
    
    headers = lines[0].split('\t')
    # 初始化索引为 -1
    idx_word = idx_def = idx_cat = idx_tone = idx_pos = -1
    for i, h in enumerate(headers):
        h = h.strip()
        if h == '单词':
            idx_word = i
        elif h == '释义':
            idx_def = i
        elif h == '分类':
            idx_cat = i
        elif h == '声调':
            idx_tone = i
        elif h == '词性':
            idx_pos = i
    # 如果没找到，使用回退位置（确保不崩溃）
    if idx_word == -1: idx_word = 2
    if idx_def == -1: idx_def = 3
    if idx_cat == -1:
        # 如果找不到“分类”列，尝试最后一列（但要排除空列）
        idx_cat = len(headers) - 1
        while idx_cat >= 0 and headers[idx_cat].strip() == '':
            idx_cat -= 1
    if idx_tone == -1: idx_tone = 1
    if idx_pos == -1: idx_pos = 5
    
    data = []
    for line in lines[1:]:
        if not line.strip():
            continue
        parts = line.split('\t')
        word = parts[idx_word].strip() if idx_word < len(parts) else ''
        if not word:
            continue
        
        # 收集词性（多列） - 只取到分类列之前
        pos_parts = []
        end_pos = min(idx_cat, idx_pos + 5)   # 关键：循环到分类列索引为止
        for i in range(idx_pos, end_pos):
            if i < len(parts) and parts[i] and parts[i].strip():
                pos_parts.append(parts[i].strip())

        item = {
            'w': word,
            'd': parts[idx_def].strip() if idx_def < len(parts) else '',
            'c': parts[idx_cat].strip() if idx_cat < len(parts) else '未分类',
            't': parts[idx_tone].strip() if idx_tone < len(parts) else '',
            'p': ', '.join(pos_parts) if pos_parts else ''
        }
        data.append(item)
        # 在 row = {...} 之后，添加：
        if len(data) < 5:
            print(f"单词: {item['w']}, 分类原始值: '{parts[idx_cat] if idx_cat < len(parts) else '无'}'")
            
    return data

def build_data(data):
    # 按分类分组单词
    category_words = defaultdict(list)
    word_info = {}
    
    for item in data:
        cat = item['c']
        category_words[cat].append(item['w'])
        word_info[item['w']] = {
            'definition': item['d'],
            'pos': item['p'],
            'category': cat,
            'tone': item['t']
        }
    
    # 统计分类节点
    category_nodes = []
    for cat, words in category_words.items():
        category_nodes.append({
            'id': f'cat_{cat}',
            'label': f'{cat} ({len(words)})',
            'type': 'category',
            'category_name': cat,
            'word_count': len(words)
        })
    
    return {
        'category_nodes': category_nodes,
        'category_words': dict(category_words),
        'word_info': word_info
    }

data = parse_wanlon_table('wanlontable.txt')
print(f"解析到 {len(data)} 个单词")

result = build_data(data)
print(f"生成 {len(result['category_nodes'])} 个分类节点")

# 保存为 JSON
with open('wanlon_data.json', 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, separators=(',', ':'))

print("✅ 已生成 wanlon_data.json")
print(f"分类数: {len(result['category_nodes'])}")
for cat in result['category_nodes'][:10]:
    print(cat['label'])