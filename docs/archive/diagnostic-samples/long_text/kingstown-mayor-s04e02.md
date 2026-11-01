# 样本：金斯敦市长 S04E02 - 祈祷/长句独白

## 来源
- 文件：`bug/金斯敦市长 - S04E02 - 第 2 集.srt`

## 片段
```srt
31
00:01:08,936 --> 00:01:11,905
I believe in Jesus Christ,
His only son, our Lord,

32
00:01:12,039 --> 00:01:14,074
conceived by the Holy Ghost,

40
00:01:29,557 --> 00:01:34,362
Our Father, who art in Heaven,
hallowed be Thy Name.
```

## 风险分类
- `long_text`
- `multi_line_dialogue`

## 期望行为
- 保留祈祷独白的连续性
- 不应因相邻祈祷/旁白混在一起而错配
- 长句应合理换行，不应暴力压缩

## 历史风险
- 长句块容易上下文污染
- 与旁白、音乐、呻吟声混排时易错配
- 容易出现部分条目丢失或串条

## 建议策略
- 命中高风险时缩块
- 长句保持逐条映射
