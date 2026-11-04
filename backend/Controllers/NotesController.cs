using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Foliant.Api.Data;
using Foliant.Api.Domain;
using Foliant.Api.Dtos;

namespace Foliant.Api.Controllers;

[ApiController]
[Authorize]
[Route("notes")]
public class NotesController : ApiControllerBase
{
    private readonly AppDbContext _db;
    public NotesController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<List<NoteDto>>> List() =>
        (await _db.Notes.AsNoTracking().Where(n => n.UserId == UserId)
            .OrderByDescending(n => n.IsPinned).ThenByDescending(n => n.UpdatedAt)
            .ToListAsync())
        .Select(ToDto).ToList();

    [HttpPost]
    public async Task<ActionResult<NoteDto>> Create(NoteInput input)
    {
        var note = new Note { UserId = UserId };
        Apply(note, input);
        _db.Notes.Add(note);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(List), ToDto(note));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<NoteDto>> Update(int id, NoteInput input)
    {
        var note = await _db.Notes.FirstOrDefaultAsync(n => n.Id == id && n.UserId == UserId);
        if (note == null) return NotFound();
        Apply(note, input);
        note.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return ToDto(note);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var note = await _db.Notes.FirstOrDefaultAsync(n => n.Id == id && n.UserId == UserId);
        if (note == null) return NotFound();
        _db.Notes.Remove(note);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static void Apply(Note n, NoteInput i)
    {
        n.Title = i.Title;
        n.Content = i.Content;
        n.Color = i.Color;
        n.IsPinned = i.IsPinned;
    }

    private static NoteDto ToDto(Note n) =>
        new(n.Id, n.Title, n.Content, n.Color, n.IsPinned, n.CreatedAt, n.UpdatedAt);
}
