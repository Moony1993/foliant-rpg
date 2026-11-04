using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Foliant.Api.Domain;
using Foliant.Api.Dtos;
using Foliant.Api.Services;

namespace Foliant.Api.Controllers;

[ApiController]
[Route("auth")]
public class AuthController : ApiControllerBase
{
    private readonly UserManager<AppUser> _users;
    private readonly JwtTokenService _jwt;
    public AuthController(UserManager<AppUser> users, JwtTokenService jwt)
    {
        _users = users;
        _jwt = jwt;
    }

    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest req)
    {
        var user = await _users.FindByNameAsync(req.Username);
        if (user == null || !await _users.CheckPasswordAsync(user, req.Password))
            return Unauthorized(new { message = "Invalid username or password." });

        var roles = await _users.GetRolesAsync(user);
        var token = _jwt.Create(user, roles);
        return new LoginResponse(token, user.Id, user.DisplayName, roles.ToArray(), user.MustChangePassword);
    }

    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest req)
    {
        var user = await _users.FindByIdAsync(UserId);
        if (user == null) return Unauthorized();

        var result = await _users.ChangePasswordAsync(user, req.CurrentPassword, req.NewPassword);
        if (!result.Succeeded)
            return BadRequest(new { errors = result.Errors.Select(e => e.Description) });

        user.MustChangePassword = false;
        await _users.UpdateAsync(user);
        return NoContent();
    }
}
