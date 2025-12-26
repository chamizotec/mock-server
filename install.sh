#!/bin/bash

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para imprimir mensagens coloridas
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Função para verificar se um comando existe
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Função para obter o diretório raiz do projeto (onde o script será executado)
get_root_dir() {
    # Tenta encontrar o diretório raiz procurando por package.json ou .git
    local current_dir=$(pwd)
    local search_dir="$current_dir"
    
    # Se o script está sendo executado de dentro do mock-server, sobe um nível
    if [[ "$current_dir" == *"mock-server"* ]] && [[ -f "package.json" ]] && [[ "$(basename "$current_dir")" == "mock-server" ]]; then
        search_dir="$(dirname "$current_dir")"
    fi
    
    echo "$search_dir"
}

print_info "Iniciando instalação do Mock Server..."
echo ""

# 1. Verificar se Node.js está instalado
print_info "Verificando se Node.js está instalado..."
if ! command_exists node; then
    print_error "Node.js não está instalado!"
    print_info "Por favor, instale o Node.js (versão 18 ou superior) antes de continuar."
    print_info "Visite: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version)
print_success "Node.js encontrado: $NODE_VERSION"
echo ""

# 2. Obter diretório raiz
ROOT_DIR=$(get_root_dir)
print_info "Diretório raiz do projeto: $ROOT_DIR"
cd "$ROOT_DIR" || exit 1
echo ""

# 3. Verificar se a pasta mock-server já existe
print_info "Verificando se a pasta mock-server já existe..."
if [ -d "mock-server" ]; then
    print_warning "A pasta mock-server já existe!"
    print_info "Se você deseja reinstalar, remova a pasta mock-server primeiro."
    print_info "Exemplo: rm -rf mock-server"
    exit 0
fi

print_success "Pasta mock-server não encontrada. Prosseguindo com a instalação..."
echo ""

# 4. Verificar se git está instalado (necessário para clone)
print_info "Verificando se Git está instalado..."
if ! command_exists git; then
    print_error "Git não está instalado!"
    print_info "Por favor, instale o Git antes de continuar."
    print_info "Visite: https://git-scm.com/"
    exit 1
fi

print_success "Git encontrado"
echo ""

# 5. Clonar o repositório
print_info "Clonando o repositório mock-server..."
if git clone https://github.com/chamizotec/mock-server.git mock-server; then
    print_success "Repositório clonado com sucesso!"
else
    print_error "Falha ao clonar o repositório!"
    exit 1
fi
echo ""

# 6. Entrar na pasta mock-server e instalar dependências
print_info "Instalando dependências do mock-server..."
cd mock-server || exit 1

if npm install; then
    print_success "Dependências instaladas com sucesso!"
else
    print_error "Falha ao instalar dependências!"
    exit 1
fi
echo ""

# 7. Voltar para a raiz e verificar/adicionar script no package.json
cd "$ROOT_DIR" || exit 1
print_info "Verificando package.json na raiz do projeto..."

if [ -f "package.json" ]; then
    print_success "package.json encontrado!"
    
    # Verificar se o script já existe
    if grep -q '"mock-server"' package.json; then
        print_warning "O script 'mock-server' já existe no package.json"
    else
        print_info "Adicionando script 'mock-server' ao package.json..."
        
        # Criar backup do package.json
        cp package.json package.json.bak
        
        # Adicionar o script usando node (mais confiável que sed/awk)
        node << 'EOF'
const fs = require('fs');
const path = require('path');

const packagePath = path.join(process.cwd(), 'package.json');
const package = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

if (!package.scripts) {
    package.scripts = {};
}

if (!package.scripts['mock-server']) {
    package.scripts['mock-server'] = 'cd mock-server && npm start';
    fs.writeFileSync(packagePath, JSON.stringify(package, null, 2) + '\n');
    console.log('Script adicionado com sucesso!');
} else {
    console.log('Script já existe!');
}
EOF
        
        if [ $? -eq 0 ]; then
            print_success "Script 'mock-server' adicionado ao package.json"
            rm -f package.json.bak
        else
            print_error "Falha ao adicionar script ao package.json"
            # Restaurar backup se houver erro
            if [ -f "package.json.bak" ]; then
                mv package.json.bak package.json
            fi
            exit 1
        fi
    fi
else
    print_warning "package.json não encontrado na raiz do projeto"
    print_info "O script 'mock-server' não será adicionado automaticamente"
    print_info "Você pode adicionar manualmente ao package.json:"
    echo ""
    echo '  "scripts": {'
    echo '    "mock-server": "cd mock-server && npm start"'
    echo '  }'
    echo ""
fi
echo ""

# 8. Verificar/adicionar mock-server ao .gitignore
print_info "Verificando .gitignore na raiz do projeto..."

if [ -f ".gitignore" ]; then
    print_success ".gitignore encontrado!"
    
    # Verificar se mock-server já está no .gitignore
    if grep -q "^mock-server$" .gitignore || grep -q "^mock-server/" .gitignore; then
        print_warning "mock-server já está no .gitignore"
    else
        print_info "Adicionando mock-server ao .gitignore..."
        echo "" >> .gitignore
        echo "# Mock Server" >> .gitignore
        echo "mock-server" >> .gitignore
        print_success "mock-server adicionado ao .gitignore"
    fi
else
    print_warning ".gitignore não encontrado na raiz do projeto"
    print_info "Criando .gitignore e adicionando mock-server..."
    echo "# Mock Server" > .gitignore
    echo "mock-server" >> .gitignore
    print_success ".gitignore criado e mock-server adicionado"
fi
echo ""

# 9. Resumo final
print_success "=========================================="
print_success "Instalação concluída com sucesso!"
print_success "=========================================="
echo ""
print_info "Próximos passos:"
echo ""
print_info "1. Para iniciar o mock-server, execute:"
echo "   ${GREEN}npm run mock-server${NC}"
echo "   ou"
echo "   ${GREEN}cd mock-server && npm start${NC}"
echo ""
print_info "2. Acesse a documentação Swagger em:"
echo "   ${GREEN}http://localhost:3001/api-docs${NC}"
echo ""
print_info "3. Configure seus mocks na pasta mock-server/mocks/"
echo ""

