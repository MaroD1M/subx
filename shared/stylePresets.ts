/**
 * 翻译风格预设配置
 * 为 AI 字幕翻译注入不同的语气和表达风格
 */
export interface StylePreset {
    id: string
    name: string
    icon: string
    description: string
    prompt: string
}

export const STYLE_PRESETS: StylePreset[] = [
    {
        id: 'default',
        name: '通用标准',
        icon: 'i-lucide-captions',
        description: '忠于原文，自然流畅的通用翻译',
        prompt: ''
    },
    {
        id: 'gritty-crime',
        name: '粗犷犯罪 / 废土末日',
        icon: 'i-lucide-skull',
        description: '适用于犯罪剧、黑帮片、末日废土、动作爽片',
        prompt: '请使用粗犷、街头且极具张力的口语化表达。在保留原意的前提下，允许使用符合中文语境的市井俚语和适度的粗口（如：他妈的、卧槽、瘪三、滚蛋）。句子要简短有力，符合底层人物或硬汉的性格，拒绝文绉绉的书面语。'
    },
    {
        id: 'british-spy',
        name: '英伦谍战 / 黑色幽默',
        icon: 'i-lucide-glasses',
        description: '适用于英国军情五处题材、政治惊悚剧、黑色喜剧',
        prompt: '请侧重展现英式英语的冷幽默、讽刺和自嘲。大量使用反语和轻描淡写（Understatement）的修辞手法。语气要显得克制、干瘪、愤世嫉俗但又透着聪明。对于官僚主义的对话，翻译得越敷衍、越阴阳怪气越好。'
    },
    {
        id: 'period-drama',
        name: '历史正剧 / 古典宫廷',
        icon: 'i-lucide-crown',
        description: '适用于中世纪题材、欧洲宫廷剧、维多利亚时代剧集',
        prompt: '请使用典雅、正式且略带古风的中文进行翻译。严格注意对话中的阶级感和尊卑关系，准确使用敬辞和谦辞（如：阁下、大人、陛下、鄙人）。用词要考究，可以适度使用四字成语或半文言文结构，展现历史厚重感。'
    },
    {
        id: 'modern-comedy',
        name: '现代喜剧 / 流行情景',
        icon: 'i-lucide-laugh',
        description: '适用于现代都市剧、情景喜剧、脱口秀',
        prompt: '请使用轻松、活泼、网感强的现代中文口语。如果原文包含双关语或文化梗，请尽量进行意译，替换为中国观众秒懂的流行梗或幽默表达。语气要生动自然，像日常朋友间的吐槽和打闹。'
    },
    {
        id: 'scifi-thriller',
        name: '硬核科幻 / 严肃悬疑',
        icon: 'i-lucide-atom',
        description: '适用于硬科幻、刑侦推理剧、法庭剧',
        prompt: '请保持极其冷静、客观和严谨的基调。对于科学术语、法律条文、医学名词和警方黑话，必须翻译得绝对专业、准确。逻辑连词要清晰，句式偏向理性和书面化，不带任何多余的情感色彩。'
    },
    {
        id: 'anime-fantasy',
        name: '日漫 / 二次元奇幻',
        icon: 'i-lucide-sparkles',
        description: '适用于日本动画、轻小说改编、异世界与热血番',
        prompt: '请使用自然、有画面感的二次元中文表达。保留角色性格和招式名的辨识度，专有名词在同一作品内保持一致。热血台词要有冲击力，日常对话要轻快，不要过度书面化，也不要滥用网络梗。'
    },
    {
        id: 'family-drama',
        name: '家庭伦理 / 都市情感',
        icon: 'i-lucide-heart-handshake',
        description: '适用于家庭剧、都市情感、婚姻与生活题材',
        prompt: '请使用自然、细腻、生活化的中文口语。准确传达人物关系、情绪层次和潜台词，避免把争吵、冷战、关心等语气翻得过于书面或平均。称谓要符合中文家庭关系习惯，并在全剧中保持一致。'
    },
    {
        id: 'medical-workplace',
        name: '医疗 / 职场专业剧',
        icon: 'i-lucide-stethoscope',
        description: '适用于医疗剧、律所、金融、科技公司等职场题材',
        prompt: '请使用专业、清晰、克制的职场中文。医学、法律、金融和工程术语必须准确，缩写首次出现时可保留英文并以自然方式补充中文。会议、汇报和指令要简洁有层级，避免把专业对话翻成日常闲聊。'
    },
    {
        id: 'crime-investigation',
        name: '犯罪悬疑 / 警匪推理',
        icon: 'i-lucide-shield',
        description: '适用于警匪剧、犯罪悬疑、连环案件与调查题材',
        prompt: '请使用冷静、紧凑、带有调查感的中文。警方程序、证据链、审讯和法医术语要专业准确；审讯对话要有压迫感和潜台词，避免过度解释。线索相关台词必须前后一致，不能模糊化关键信息。'
    },
    {
        id: 'wuxia-xianxia',
        name: '古装武侠 / 仙侠江湖',
        icon: 'i-lucide-swords',
        description: '适用于武侠、仙侠、修真、江湖与门派题材',
        prompt: '请使用有江湖气和古典韵味的中文，但不要堆砌生僻文言。门派、境界、功法、兵器名要保持统一且易懂。对白要符合人物辈分和门派身份，打斗描写要有节奏，情感表达含蓄而有张力。'
    },
    {
        id: 'fantasy-epic',
        name: '奇幻史诗 / 魔法世界',
        icon: 'i-lucide-wand-sparkles',
        description: '适用于西幻、魔法学院、精灵矮人、史诗冒险',
        prompt: '请使用具有史诗感和世界构建感的中文。种族、地名、魔法体系、组织与头衔必须统一，专有名词以易读、可记忆为优先。正式场合使用庄重表达，冒险和日常对话可更自然，避免现代网络用语破坏世界观。'
    },
    {
        id: 'teen-campus',
        name: '青春校园 / 成长',
        icon: 'i-lucide-graduation-cap',
        description: '适用于青春剧、校园、成长、青少年友情与恋爱',
        prompt: '请使用自然、轻快、符合年轻人口语习惯的中文，但不要滥用过时网络梗。保留角色年龄感和性格差异，暧昧、玩笑、冲突和道歉要符合青少年的表达方式。校园、社团和家庭称谓要统一。'
    },
    {
        id: 'horror-supernatural',
        name: '恐怖 / 惊悚 / 灵异',
        icon: 'i-lucide-ghost',
        description: '适用于恐怖片、惊悚剧、灵异与超自然题材',
        prompt: '请使用克制、阴冷、有压迫感的中文。减少感叹和过度解释，通过短句、停顿和留白制造不安感。灵异规则、诅咒、仪式和怪物名称必须准确且前后一致，不要把恐怖对白翻得轻松或口语化。'
    },
    {
        id: 'war-military',
        name: '战争 / 军事 / 谍战',
        icon: 'i-lucide-crosshair',
        description: '适用于战争片、军事行动、谍战与政治惊悚',
        prompt: '请使用硬朗、简洁、有纪律感的军事中文。军衔、编制、武器、行动代号和无线电用语要准确统一；命令和汇报要短促清晰。谍战对话要保留试探、隐瞒和双重含义，避免过度解释。'
    },
    {
        id: 'documentary-narration',
        name: '纪录片 / 旁白',
        icon: 'i-lucide-book-open-text',
        description: '适用于自然、历史、科技、人文纪录片与旁白',
        prompt: '请使用准确、平实、有知识密度的纪录片中文。事实、数字、年代、专有名词和科学概念必须严谨，避免夸张和情绪化修饰。旁白要有节奏和画面感，采访口语保持自然，不要统一成宣传片腔。'
    },
    {
        id: 'standup-comedy',
        name: '脱口秀 / 单口喜剧',
        icon: 'i-lucide-mic-vocal',
        description: '适用于单口喜剧、脱口秀、喜剧特辑与段子',
        prompt: '请优先传达笑点、节奏和反转，而不是逐字直译。双关、文化梗和自嘲可以在不改变原意的前提下本地化，但要保留表演者的立场和锋利度。避免解释笑话，避免使用与原文语气冲突的网络热词。'
    },
    {
        id: 'arthouse-poetic',
        name: '文艺 / 诗意 / 作者电影',
        icon: 'i-lucide-feather',
        description: '适用于文艺片、作者电影、诗意旁白与慢节奏作品',
        prompt: '请使用克制、含蓄、有文学质感的中文。保留隐喻、意象和留白，不要为了顺口而过度解释或口语化。句式可以有节奏变化，但不能晦涩；情感表达要内敛，避免煽情和俗套。'
    },
    {
        id: 'kids-family',
        name: '儿童 / 合家欢',
        icon: 'i-lucide-baby',
        description: '适用于儿童动画、家庭电影、合家欢与亲子题材',
        prompt: '请使用简单、温暖、容易理解的中文，避免复杂长句和成人化俚语。保留童真和幽默，拟声词、角色昵称和歌曲要自然顺口。涉及教育、安全和家庭价值观的表达要准确，不要添加原文没有的说教。'
    },
    {
        id: 'legal-political',
        name: '法律 / 政治 / 新闻',
        icon: 'i-lucide-scale',
        description: '适用于法庭剧、政治剧、新闻编辑室与公共事务',
        prompt: '请使用正式、精确、有逻辑层级的中文。法律条文、程序、职位、机构名和政治术语必须准确统一；辩论要保留论证结构和攻防关系。避免把正式发言翻得口语化，也不要添加原文没有的立场。'
    },
    {
        id: 'music-musical',
        name: '音乐 / 歌舞 / 歌词',
        icon: 'i-lucide-music',
        description: '适用于音乐剧、歌舞片、演唱会与歌词字幕',
        prompt: '歌词翻译优先考虑可唱性、节奏和押韵，同时保留原意与情绪。非歌词对白保持自然口语。副歌、重复句和角色主题要使用一致译法；必要时可用括号补充直译含义，但不要破坏歌词的流畅度。'
    }
]
