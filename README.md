# FileServ – Mini Google Drive

FileServ é um aplicativo web construído em Flask que oferece uma experiência similar a um “mini Google Drive”: usuários autenticados podem navegar por suas pastas, fazer upload/download de arquivos (inclusive pastas inteiras), criar estruturas hierárquicas e compartilhar acesso com permissões granulares. Administradores possuem ferramentas adicionais para gerenciar usuários e controlar quem pode ler ou editar cada pasta.

## Principais funcionalidades

- **Autenticação e papéis**: suporte a usuários padrão e administradores, com login/logout via Flask‑Login.
- **Gerenciador de arquivos**:
  - Upload de arquivos individuais ou pastas completas (com indicador de progresso e tempo estimado).
  - Download de arquivos ou pastas (pastas são compactadas em `.zip` sob demanda).
  - Breadcrumbs, ordenação por nome/data e navegação hierárquica.
- **Permissões avançadas**:
  - Cada pasta pode ser compartilhada com leitura e/ou edição por usuário.
  - Administradores visualizam e editam todo o conteúdo armazenado (`instance/uploads`).
- **Painel administrativo**:
  - CRUD de usuários, atribuição de papéis e gerenciamento de permissões por pasta.
  - Destaques na tela inicial alertam admins sobre atalhos do painel.
- **Ferramentas CLI**:
  - `flask init-db` – recria o schema do banco.
  - `flask create-admin` – cria/atualiza um usuário administrador com senha hash.
  - `flask sync-uploads` – sincroniza arquivos adicionados manualmente em `instance/uploads/user_<id>` com a tabela `files`.

## Requisitos

- Python 3.11+ (o projeto atual roda em 3.13).
- PostgreSQL (configurar `DATABASE_URL` no `.env`).
- Dependências listadas em `requirements.txt`.

## Configuração do ambiente

1. **Clonar o repositório**:
   ```bash
   git clone https://github.com/Gecesars/server.git
   cd server
   ```

2. **Criar virtualenv e instalar dependências**:
   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Arquivo `.env`**  
   Na raiz do projeto, crie um `.env` com, pelo menos:
   ```
   DATABASE_URL=postgresql://usuario:senha@host:5432/eftx_dev
   SECRET_KEY=<chave-secreta>
   ```

4. **Inicializar o banco**:
   ```bash
   flask --app run.py init-db
   flask --app run.py db upgrade
   ```

5. **Criar um admin**:
   ```bash
   flask --app run.py create-admin --username admin --password "<senha>"
   ```

6. **Sincronizar uploads existentes (opcional)**:
   Se houver conteúdo pré-carregado em `instance/uploads/user_<id>`, execute:
   ```bash
   flask --app run.py sync-uploads
   ```

## Executando a aplicação

Ambiente de desenvolvimento:

```bash
flask --app run.py run --debug
```

Produção (exemplo com Gunicorn):

```bash
gunicorn -w 4 --bind 0.0.0.0:7500 run:app
```

> Observação: o `server.service` (systemd) fornecido no servidor já usa esse comando. Caso inicie manualmente, garanta que a porta 7500 esteja livre.

## Uso do painel

- Acesse `http://<host>:7500/` e faça login.
- Usuários comuns: navegam pelas próprias pastas e as que receberam permissão.
- Administradores:
  - Veem todos os diretórios e têm indicador especial na tela inicial.
  - Acesse `/admin/users` para criar/editar usuários e gerenciar permissões (check-box de leitura/edição por pasta).

## Estrutura de diretórios

- `app/` – aplicação Flask (blueprints, templates, static).
- `instance/uploads/` – armazenamento físico por usuário (`user_<id>`).
- `migrations/` – scripts Alembic.
- `instrucao.md` – anotações internas do time.

## Dicas de operação

- **Uploads diretos via SCP/FTP**: sempre rode `flask sync-uploads` depois para registrar os arquivos no banco.
- **Limpeza de cache**: assets estáticos possuem versionamento (`config.Config.ASSET_VERSION`). Ao atualizar JS/CSS, incremente o valor para forçar os navegadores a baixarem a nova versão.
- **Logs**: use `journalctl -u server -f` para monitorar uploads/downloads (o endpoint loga progresso e exceções).

## Licença

Este projeto é proprietário (interno EFTX). Ajuste esta seção caso defina outra licença.
