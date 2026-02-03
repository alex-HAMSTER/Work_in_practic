# Публикация в Git

Коммит уже создан. Чтобы закинуть проект на GitHub:

## Вариант 1: GitHub CLI (gh)

1. Переавторизуйтесь:
   ```bash
   gh auth login
   ```

2. Создайте приватный репозиторий и отправьте код:
   ```bash
   gh repo create Work_in_practic --private --source=. --push
   ```

## Вариант 2: Создать репо вручную на GitHub

1. Откройте https://github.com/new
2. Укажите название: **Work_in_practic**
3. Выберите **Private**
4. Не создавайте README (он уже в проекте)
5. Выполните в терминале:

   ```bash
   cd /Users/alex/Work_in_practic
   git remote add origin https://github.com/YOUR_USERNAME/Work_in_practic.git
   git push -u origin main
   ```

Замените `YOUR_USERNAME` на ваш логин GitHub.
