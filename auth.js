--- START OF FILE public/auth.js ---
document.addEventListener('DOMContentLoaded', () => {
    const navbar = document.getElementById('navbar');
    if (!navbar) return; // Se não houver navbar na página, não faz nada

    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');

    // Base dos links que aparecem em todas as páginas
    let navLinks = `
        <a href="index.html">Chat</a>
        <a href="historico.html">Histórico</a>
        <a href="sobrebot.html">Sobre</a>
        <a href="admin.html">Admin</a>
    `;

    // Links condicionais baseados no login
    if (token && username) {
        navLinks += `
            <a href="configuracoes.html" style="font-weight: 600;">Olá, ${username}! (Configurações)</a>
            <a href="#" id="logout-link" style="color: #e74c3c;">Sair</a>
        `;
    } else {
        navLinks += `
            <a href="login.html">Login</a>
            <a href="register.html">Registrar</a>
        `;
    }

    navbar.innerHTML = navLinks;

    // Adiciona o evento de logout se o link existir
    const logoutLink = document.getElementById('logout-link');
    if (logoutLink) {
        logoutLink.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            // Redireciona para a página de login para uma experiência limpa
            window.location.href = 'login.html';
        });
    }
});
--- END OF FILE ---
