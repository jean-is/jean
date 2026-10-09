// Assistant names (docs/product.md, "Projects"): a project's assistant can have a name of its own
// and a few words on how to be, written by the user in the project's dialog. A project with a
// name and a way of being is what other products call an agent (D18). Both go into the project's
// section of the prompt (a note, in conversations already under way, D81); the header shows the
// name, and so does every string that names the assistant. Nothing agrees with it grammatically.
import { register } from '../../ui/caps.js'

register({ id: 'names' })
