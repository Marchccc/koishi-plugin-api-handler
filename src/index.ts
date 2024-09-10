import { Context, Schema, Logger } from 'koishi'

export const usage = `
## koishi-plugin-api-handler v1.1.2

1. 配置API地址。

2. 设置消息前缀，例如：tx。

3. 当用户发送的消息以该前缀开头（如tx1234或Tx1234）时，系统将通过POST方式向API发送请求，包括参数：token、message、channelId

4. 服务器需返回一个字符串，该字符串将作为机器人的回复消息。

注意：只有群内@机器人的消息才会处理。
注意：正则配置适用于群内和私聊。


微信配合adapter-wechat4u使用。

`

export const name = 'koishi-plugin-api-handler'

export const logger = new Logger('koishi-plugin-api-handler')

export interface Config {
  api: string,
  token: string,
  prefix_1: string,
  prefix_2: string,
  prefix_3?: string,
  prefix_4?: string,
  regex_1: string,
  regex_2: string,
  regex_3?: string,
  regex_4?: string,
  wx_api?: string,
  wx_token?: string,
  bot_name?: string,
  wx_group_all_message?: boolean,
}
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    api: Schema.string().required(true).description('API地址'),
    token: Schema.string().required(true).description('API接收的token，以POST传递,参数名为token'),
    prefix_1: Schema.string().required(true).description('消息开头匹配字符串，不区分大小写，完全包含则将用户消息发送到API，由API返回回复内容字符串'),
    prefix_2: Schema.string().description('匹配消息前缀2'),
    prefix_3: Schema.string().description('匹配消息前缀3'),
    prefix_4: Schema.string().description('匹配消息前缀4'),
    regex_1: Schema.string().description('正则匹配消息1').description('正则匹配消息，符合则将用户消息发送到API，由API返回回复内容字符串'),
    regex_2: Schema.string().description('正则匹配消息2'),
    regex_3: Schema.string().description('正则匹配消息3'),
    regex_4: Schema.string().description('正则匹配消息4'),
  }).description('基础设置'),
  Schema.object({
    wx_api: Schema.string().description('API地址'),
    wx_token: Schema.string().description('API接收的token，以POST传递,参数名为token'),
    bot_name: Schema.string().description('wx机器人昵称,用于判定是否@'),
    wx_group_all_message: Schema.boolean().description('wx群组所有消息都处理'),
  }).description('微信设置(结合wechat4u使用)'),
]);
// export const Config: Schema<Config> = Schema.object({
//   api: Schema.string().required(true).description('API地址'),
//   token: Schema.string().required(true).description('API接收的token，以POST传递,参数名为token'),
//   prefix_1: Schema.string().required(true).description('消息开头匹配字符串，不区分大小写，完全包含则将用户消息发送到API，由API返回回复内容字符串'),
//   prefix_2: Schema.string().description('匹配消息前缀2'),
//   prefix_3: Schema.string().description('匹配消息前缀3'),
//   prefix_4: Schema.string().description('匹配消息前缀4'),
//   bot_name: Schema.string().description('wx机器人昵称,用于判定是否@'),
//   wx_group_all_message: Schema.boolean().description('wx群组所有消息都处理'),
// })

export function startsWithPrefix(str: string, prefix: string) {
  // 首先去掉字符串前后的空格
  str = str.trim();

  // 构建正则表达式，不区分大小写
  const regex = new RegExp('^' + prefix, 'i');

  // 使用正则表达式判断是否以指定前缀开头
  return regex.test(str);
}

export function handlePrefixes(sessionContent: string, config: Config) {
  for (let i = 1; i <= 4; i++) {
    let prefixKey = `prefix_${i}`;
    if (config[prefixKey]) {
      if (startsWithPrefix(sessionContent, config[prefixKey])) {
        // 这里可以根据前缀执行不同的逻辑
        return `匹配前缀${i}`;
      }
    }
  }
}

export function handleRegex(sessionContent: string, config: Config) {
  for (let i = 1; i <= 4; i++) {
    let prefixKey = `regex_${i}`;
    if (config[prefixKey]) {
      if ((new RegExp(config[prefixKey])).test(sessionContent)) {
        return `匹配正则${i}`;
      }
    }
  }

}

export function apply(ctx: Context, config: Config) {
  ctx.middleware(async (session, next) => {

    let content = session.content;
    const botId = session.selfId;

    // logger.info(session);
    logger.info('群组:' + session.channelId)
    logger.info('原始消息:' + content);
    logger.info('机器人ID:' + botId);

    const mentionRegex2 = new RegExp(`private:`);
    const isPrivateChat = session.channelId && mentionRegex2.test(session.channelId);

    if (session.platform == 'wechaty') {
      const mentionRegex = new RegExp(`@${config.bot_name}`);
      const isMentioned = content && mentionRegex.test(content);
      let regex = new RegExp(`@${config.bot_name}\\s*`, "g");
      content = content.replace(regex, "").trim();

      logger.info('是否私聊:' + isPrivateChat);
      logger.info('是否@:' + isMentioned);
      logger.info('过滤@后的内容:' + content);

      // 非私聊、非群组@,群组内其他消息
      // 若关闭了回复所有群组消息，则直接返回空
      if (!isPrivateChat && !isMentioned && !config.wx_group_all_message) {
        return '';
        // return next()
      }

      // 私聊/群组@
      let wx_match_prefix = handlePrefixes(content, config)
      if (wx_match_prefix) {
        logger.info(wx_match_prefix)
        const res = await ctx.http.post(config.wx_api, {
          token: config.wx_token,
          message: content,
          channelId: session.channelId,
        })
          .catch((err) => {
            return { error: err.message }
          })
        if (res !== undefined) {
          return res;
        }

        return 'Error';
      }
      return next()
    }

    if (session.platform == 'onebot') {
      // 使用正则表达式确保准确匹配特定的提到格式
      const mentionRegex = new RegExp(`<at id="${botId}"/>`);
      const isMentioned = content && mentionRegex.test(content);

      const cleanContent = content.replace(/<at id="\d+"\/>/g, '').trim();

      logger.info('是否私聊:' + isPrivateChat);
      logger.info('是否@:' + isMentioned);
      logger.info('过滤@后的内容:' + cleanContent);

      // 非私聊、非群组@
      // 群组内其他消息，则直接返回空
      if (!isPrivateChat && !isMentioned) {
        return '';
      }

      // 私聊直接返回AI内容
      if (isPrivateChat) {

        // 私聊也处理正则
        let match_regex = handleRegex(cleanContent, config)
        if (match_regex) {
          logger.info(match_regex)
          const res = await ctx.http.post(config.api, {
            token: config.token,
            message: cleanContent,
            channelId: session.channelId,
          })
            .catch((err) => {
              return { error: err.message }
            })
          if (res !== undefined) {
            return res;
          }
        }

        return next()
      }

      // 群内@，如果匹配到前缀，请求API结果
      // 如未匹配到，返回AI内容
      let match_prefix = handlePrefixes(cleanContent, config)
      let match_regex = handleRegex(cleanContent, config)
      if (match_prefix || match_regex) {
        logger.info(match_prefix)
        logger.info(match_regex)
        const res = await ctx.http.post(config.api, {
          token: config.token,
          message: cleanContent,
          channelId: session.channelId,
        })
          .catch((err) => {
            return { error: err.message }
          })
        if (res !== undefined) {
          return res;
        }

        return 'Error';
      }
      return next()
    }
  }, true)
}
