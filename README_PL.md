
# Cliente Web e Mobile do Metin2 (Edição Comunitária para Metin2 Singleplayer)

Pacote completo de **Cliente Web e Mobile (WebAssembly / HTML5)** que permite jogar no servidor **Metin2 Singleplayer (Linux/VPS)** diretamente pelo navegador do computador ou celular (Android / iOS), sem a necessidade de baixar o cliente tradicional `.exe`.

---

## O que está incluído no pacote?

### 1. Cliente do jogo para navegador e celular (`/client.html`, `/mobile.html`)

- Cliente completo do Metin2 compilado para WebAssembly (`client.wasm` + `client.data` + recursos carregados sob demanda em `/corpus/`).
- **Interface móvel (`mobile_overlay.js`):** joystick virtual, botões de toque para ataques, habilidades e poções, rotação da câmera e acesso ao inventário em telas sensíveis ao toque.
- Permite a instalação como aplicativo **PWA** na tela inicial do smartphone.

### 2. Ponte de rede WebSocket → TCP (`bridge/`)

- Servidor Node.js leve que conecta o navegador às portas de login e dos canais do servidor do jogo (`11000`, `13000+`).

### 3. Cadastro rápido de contas (`/rejestracja.html` + `reg/server.py`)

- Criação de contas de jogadores diretamente no banco de dados MariaDB, por meio do navegador.

### 4. Central de Guerras de Guildas ao vivo e replays 2D/3D (`/wojny.html` + `replay3d.py`)

- Visualização da tabela de guildas.
- Acompanhamento de guerras ativas entre bots e jogadores em tempo real.
- Gravação automática das batalhas.
- Reprodutor de replays em 2D e 3D.
- Suporte a notificações por Discord Webhook.

---

## Requisitos

- Servidor VPS com sistema **Ubuntu / Debian** e servidor **Metin2 Singleplayer** instalado e em execução (por padrão, em `/opt/metin2`).
- Acesso à conta `root` ou permissões `sudo`.

---

## Instalação rápida

### 1. Envie e extraia o pacote

Envie o arquivo `Metin2_Web_Mobile_Client_Public.zip` para o seu servidor VPS e execute os comandos abaixo.

```bash
apt-get update && apt-get install -y unzip
unzip Metin2_Web_Mobile_Client_Public.zip -d /tmp/metin2_web_client
cd /tmp/metin2_web_client
```

### 2. Execute o instalador automático

```bash
bash install.sh
```

### O que o `install.sh` fará?

- Lerá automaticamente a senha do banco de dados MariaDB da instalação do Metin2 Singleplayer:
  - `/opt/metin2/linux-port/docker/.env`
  - `/opt/metin2/.env`
- Detectará o endereço IP público do servidor VPS e configurará a conexão da ponte WebSocket (`bridge-site.json`).
- Instalará os pacotes necessários:
  - `nginx`
  - `nodejs`
  - `npm`
  - `python3-pymysql`
  - `python3-markupsafe`
- Configurará e iniciará os serviços em segundo plano:
  - `metin2-bridge`
  - `metin2-reg`
  - `nginx`

---

## Liberação de portas no firewall (UFW / iptables)

Para acessar o jogo externamente, pelo celular ou por outro computador, libere a porta **80** (ou a porta alternativa **8080**).

Se você utiliza o UFW, execute:

```bash
ufw allow 80/tcp
ufw allow 8080/tcp
ufw reload
```

**Importante:** se você utiliza o painel do provedor do VPS, como OVH, Hetzner ou Oracle Cloud, verifique também se as portas TCP `80` e `8080` estão liberadas na seção de firewall ou regras de segurança.

---

## Como acessar o jogo pelo navegador ou celular?

Após concluir a instalação, abra o navegador (Chrome, Safari, Firefox ou Edge) no computador ou smartphone e acesse os endereços abaixo.

### Jogar no PC ou celular

O cliente detecta automaticamente telas sensíveis ao toque.

```text
http://IP_DO_SEU_VPS/client.html?deflang=pl
```

Ou, utilizando a porta alternativa:

```text
http://IP_DO_SEU_VPS:8080/client.html?deflang=pl
```

### Criar uma nova conta

```text
http://IP_DO_SEU_VPS/rejestracja.html
```

### Guerras de Guildas ao vivo e replays 2D/3D

```text
http://IP_DO_SEU_VPS/wojny.html
```

Substitua `IP_DO_SEU_VPS` pelo endereço IP público do seu servidor.

> **Dica para celular:** no navegador móvel (Chrome ou Safari), selecione a opção **Adicionar à tela inicial** (*Add to Home Screen*) no menu. Assim, o cliente poderá ser aberto em tela cheia, como um aplicativo.

---

## Gerenciamento de serviços e diagnóstico

Todos os componentes são configurados como serviços `systemd` e iniciados automaticamente após a reinicialização do VPS.

### Verificar o status dos serviços

```bash
systemctl status metin2-bridge metin2-reg nginx
```

### Acompanhar os logs em tempo real

Logs da ponte WebSocket:

```bash
journalctl -u metin2-bridge -f
```

Logs da API de cadastro:

```bash
journalctl -u metin2-reg -f
```

---

## Observações importantes

- Os caminhos, as portas e os nomes dos serviços descritos neste documento são os valores previstos pelo pacote e podem variar conforme a instalação.
- Antes de executar o instalador como `root`, revise o conteúdo do arquivo `install.sh` para verificar quais alterações serão feitas no sistema.
- Não exponha o banco de dados MariaDB diretamente à internet sem necessidade.
- Utilize HTTPS e proteja o sistema de cadastro contra criação abusiva de contas.
- O parâmetro `deflang=pl` mantém o idioma polonês. Se o cliente oferecer suporte ao português, ajuste o parâmetro conforme o código de idioma utilizado pelo pacote.

