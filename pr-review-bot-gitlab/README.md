# Greiptile GitLab PR bot



## Set up
- Index your repo at greptile
- Set up personal access token for GitLab if you have not
- Configure GitLab Webhook URL
In you project, click Settings -> Webhooks -> Add new webhook
Add the webhook URL: abc

- Edit the webhook, include your personal access token in Secret token part

## Start the project
```
docker build -t pr-bot . && docker run -p 3000:3000 pr-bot
```

