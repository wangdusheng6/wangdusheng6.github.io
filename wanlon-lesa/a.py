#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
万综语单词表 Excel → JSONL 转换脚本
功能：
- 读取 Excel 文件（跳过表头行）
- 合并第 6、7、8 列（F、G、H）为“词性”字段，用 ", " 连接
- 输出 JSONL 格式（每行一个 JSON 对象）
"""

import pandas as pd
import json
import os
import sys

def convert_excel_to_jsonl(excel_path, jsonl_path):
    """
    将 Excel 转换为 JSONL，合并词性三列
    """
    # 读取 Excel，跳过第一行（表头），使用第二行作为列名
    # 实际数据从第 3 行开始（行号 2），但 pandas 用 header=1 表示第二行为列名
    df = pd.read_excel(excel_path, sheet_name=0, header=1)
    
    # 打印列名以便调试
    print("📋 检测到的列名：", df.columns.tolist())
    
    # 根据列名或位置提取关键列
    # 假设列顺序为：序号, 声调, 单词, 释义, 场合, 词性1, 词性2, 词性3, 分类, ...
    # 我们将第 6、7、8 列（索引 5,6,7）合并为词性
    # 同时保留序号（索引0）、声调（1）、单词（2）、释义（3）、场合（4）、分类（8）
    # 注意：实际列名可能略有不同，我们按位置提取更可靠
    if len(df.columns) < 9:
        print("⚠️ 列数不足，请检查 Excel 格式")
        return
    
    # 提取需要的列（按位置）
    id_col = df.iloc[:, 0]          # 序号
    tone_col = df.iloc[:, 1]        # 声调
    word_col = df.iloc[:, 2]        # 单词
    meaning_col = df.iloc[:, 3]     # 释义
    usage_col = df.iloc[:, 4]       # 场合
    pos1_col = df.iloc[:, 5]        # 词性1
    pos2_col = df.iloc[:, 6]        # 词性2
    pos3_col = df.iloc[:, 7]        # 词性3
    category_col = df.iloc[:, 8]    # 分类 (第9列)
    
    # 合并词性：将三列转为字符串，去除空值，用 ", " 连接
    def merge_pos(row):
        parts = []
        if pd.notna(row[0]) and str(row[0]).strip():
            parts.append(str(row[0]).strip())
        if pd.notna(row[1]) and str(row[1]).strip():
            parts.append(str(row[1]).strip())
        if pd.notna(row[2]) and str(row[2]).strip():
            parts.append(str(row[2]).strip())
        return ", ".join(parts) if parts else ""
    
    pos_merged = df.apply(lambda r: merge_pos([r.iloc[5], r.iloc[6], r.iloc[7]]), axis=1)
    
    # 构建新的 DataFrame 用于输出
    out_df = pd.DataFrame({
        'id': id_col,
        'tone': tone_col,
        'word': word_col,
        'meaning': meaning_col,
        'usage': usage_col,
        'pos': pos_merged,
        'category': category_col
    })
    
    # 删除全为空的行（根据 word 列判断）
    out_df = out_df.dropna(subset=['word'], how='all')
    out_df = out_df.reset_index(drop=True)
    
    # 写入 JSONL
    with open(jsonl_path, 'w', encoding='utf-8') as f:
        for _, row in out_df.iterrows():
            entry = {
                'id': int(row['id']) if pd.notna(row['id']) else None,
                'tone': str(row['tone']) if pd.notna(row['tone']) else '',
                'word': str(row['word']) if pd.notna(row['word']) else '',
                'meaning': str(row['meaning']) if pd.notna(row['meaning']) else '',
                'usage': str(row['usage']) if pd.notna(row['usage']) else '',
                'pos': str(row['pos']) if pd.notna(row['pos']) else '',
                'category': str(row['category']) if pd.notna(row['category']) else ''
            }
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')
    
    print(f"✅ 转换完成！共 {len(out_df)} 条词条")
    print(f"📁 输出文件：{jsonl_path}")
    return len(out_df)

if __name__ == "__main__":
    # 默认文件名，可根据需要修改
    excel_file = "wanlon-lesa按字母顺序.xlsx"
    jsonl_file = "wanlon_data.jsonl"
    
    if not os.path.exists(excel_file):
        print(f"❌ 未找到文件：{excel_file}")
        print("请将脚本与 Excel 文件放在同一目录，或修改 excel_file 变量")
        sys.exit(1)
    
    convert_excel_to_jsonl(excel_file, jsonl_file)